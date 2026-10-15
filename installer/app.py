#!/usr/bin/env python3
"""Single entry point for setup, the installed launcher, and the companion."""
import argparse
import json
from pathlib import Path
import queue
import sys
import threading

if not getattr(sys, "frozen", False):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from installer.core import (VERSION, Installer, SetupError, companion, default_root,
                            launch, read_json, resources, system_key)


def self_test():
    from japanese_parser import parse_japanese
    lock = read_json(resources() / "installer/assets.lock.json")
    plugin = read_json(resources() / "integrations/seanime/dist/langplay-probe.json")
    assert plugin["id"] == "langplay-probe" and plugin["payload"]
    assert len(lock[system_key()]) == 2
    assert parse_japanese("日本語を勉強しています。")
    print(json.dumps({"status": "ok", "version": VERSION, "platform": system_key(),
                      "parser": "sudachi", "plugin": plugin["version"]}))


def gui(root: Path, error=None):
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk
    window = tk.Tk()
    window.title("LangPlay Setup")
    window.geometry("700x590")
    window.minsize(620, 540)
    style = ttk.Style(window)
    style.configure("Title.TLabel", font=("", 23, "bold"))
    style.configure("Body.TLabel", padding=(0, 5))
    frame = ttk.Frame(window, padding=28)
    frame.pack(fill="both", expand=True)
    frame.columnconfigure(0, weight=1)
    frame.rowconfigure(9, weight=1)
    ttk.Label(frame, text="Seanime + LangPlay", style="Title.TLabel").grid(row=0, sticky="w")
    ttk.Label(frame, text="Your anime setup, ready on this device.", style="Body.TLabel").grid(row=1, sticky="w")
    description = ("Install Seanime, qBittorrent, the LangPlay companion, and an AnimeTosho source. "
        "Setup needs internet and about 2 GB of free space. Your existing app profiles stay separate.")
    ttk.Label(frame, text=description, wraplength=620, style="Body.TLabel").grid(row=2, sticky="ew", pady=(12, 16))
    ttk.Label(frame, text="Anime library folder").grid(row=3, sticky="w")
    saved = root / "installation.json"
    existing = read_json(saved) if saved.exists() else None
    folder = tk.StringVar(value=existing["library"] if existing else str(Path.home() / "Videos/Anime"))
    picker = ttk.Frame(frame)
    picker.grid(row=4, sticky="ew", pady=(6, 14))
    picker.columnconfigure(0, weight=1)
    entry = ttk.Entry(picker, textvariable=folder)
    entry.grid(row=0, column=0, sticky="ew")
    def browse():
        selected = filedialog.askdirectory(parent=window, initialdir=Path(folder.get()).parent,
                                           title="Choose your anime library")
        if selected:
            folder.set(selected)
    browse_button = ttk.Button(picker, text="Browse…", command=browse)
    browse_button.grid(row=0, column=1, padx=(8, 0))
    if existing:
        entry.configure(state="disabled"); browse_button.configure(state="disabled")
    ttk.Label(frame, wraplength=620, text="Automatic downloads start off. Choose shows and rules in Seanime when you’re ready.",
              style="Body.TLabel").grid(row=5, sticky="ew")
    ttk.Label(frame, wraplength=620, text="LangPlay includes the development probe. The full subtitle-learning interface is still in progress.",
              style="Body.TLabel").grid(row=6, sticky="ew", pady=(0, 12))
    status = tk.StringVar(value=error or "Ready to install")
    ttk.Label(frame, textvariable=status, wraplength=620).grid(row=7, sticky="ew", pady=(0, 8))
    progress = ttk.Progressbar(frame, mode="indeterminate")
    progress.grid(row=8, sticky="ew")
    detail = tk.Text(frame, height=6, wrap="word", state="disabled", relief="flat",
                     borderwidth=0, padx=10, pady=10, takefocus=True)
    detail.grid(row=9, sticky="nsew", pady=(10, 16))
    buttons = ttk.Frame(frame)
    buttons.grid(row=10, sticky="e")
    events = queue.Queue()
    busy = False
    ready = False

    def show_log(text):
        detail.configure(state="normal")
        detail.insert("end", text + "\n"); detail.see("end")
        detail.configure(state="disabled")

    def worker():
        try:
            Installer(root, log=lambda text: events.put(("log", text))).install(Path(folder_value).expanduser())
            events.put(("done", "Installed. Enable LangPlay once in Seanime → Extensions → Grant."))
        except Exception as exception:
            events.put(("error", str(exception)))

    def activate():
        nonlocal busy, ready, folder_value
        if ready:
            busy = True
            install_button.configure(state="disabled")
            status.set("Starting Seanime…")
            progress.configure(mode="indeterminate"); progress.start(12)
            def start_apps():
                try:
                    launch(root, log=lambda text: events.put(("log", text)))
                    events.put(("launched", ""))
                except Exception as exception:
                    events.put(("launch-error", str(exception)))
            threading.Thread(target=start_apps, daemon=True).start()
            return
        if busy:
            return
        folder_value = folder.get()
        busy = True
        install_button.configure(state="disabled")
        entry.configure(state="disabled"); browse_button.configure(state="disabled")
        status.set("Installing. This can take a few minutes…")
        progress.start(12)
        threading.Thread(target=worker, daemon=True).start()

    def poll():
        nonlocal busy, ready
        try:
            while True:
                kind, text = events.get_nowait()
                if kind == "launched":
                    window.destroy()
                    return
                show_log(text)
                if kind in ("done", "error", "launch-error"):
                    busy = False; ready = kind in ("done", "launch-error")
                    progress.stop()
                    status.set(text)
                    install_button.configure(state="normal", text="Launch Seanime" if ready else "Retry setup")
                    if not ready and not existing:
                        entry.configure(state="normal"); browse_button.configure(state="normal")
                    if ready:
                        progress.configure(mode="determinate", value=100)
        except queue.Empty:
            pass
        window.after(100, poll)

    def close():
        if busy:
            messagebox.showinfo("Please wait", "Wait for the current action to finish. If it fails, you can safely retry.", parent=window)
        else:
            window.destroy()

    folder_value = folder.get()
    ttk.Button(buttons, text="Close", command=close).pack(side="left", padx=(0, 8))
    install_button = ttk.Button(buttons, text="Install on this device", command=activate)
    install_button.pack(side="left")
    install_button.focus_set()
    window.protocol("WM_DELETE_WINDOW", close)
    window.update_idletasks()
    # Respect the platform's actual font metrics instead of clipping at a fixed height.
    width = max(700, window.winfo_reqwidth())
    height = max(590, window.winfo_reqheight())
    window.geometry(f"{width}x{height}")
    window.minsize(max(620, window.winfo_reqwidth()), height)
    window.after(100, poll)
    window.mainloop()


def main():
    parser = argparse.ArgumentParser(description="Seanime + LangPlay setup")
    parser.add_argument("--root", type=Path, default=default_root(), help="Private installation folder")
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--install", action="store_true", help="Install without a graphical window")
    modes.add_argument("--launch", action="store_true", help="Launch the installed apps")
    modes.add_argument("--companion", action="store_true", help=argparse.SUPPRESS)
    modes.add_argument("--self-test", action="store_true", help="Check bundled parser and plugin without installing")
    modes.add_argument("--check-platform", action="store_true", help="Check platform support without installing")
    parser.add_argument("--library", type=Path, default=Path.home() / "Videos/Anime")
    parser.add_argument("--cache", type=Path, help="Reuse verified package downloads from this folder")
    args = parser.parse_args()
    if args.self_test:
        self_test()
    elif args.check_platform:
        print(system_key())
    elif args.companion:
        companion(args.root.resolve())
    elif args.install:
        Installer(args.root, cache=args.cache).install(args.library.expanduser().resolve())
    elif args.launch:
        launch(args.root)
    else:
        gui(args.root)


if __name__ == "__main__":
    if sys.platform != "win32":
        import os
        os.umask(0o077)
    try:
        main()
    except Exception as exception:
        headless = any(mode in sys.argv for mode in ("--install", "--companion", "--self-test", "--check-platform"))
        if getattr(sys, "frozen", False) and sys.stdout is None and not headless:
            import tkinter as tk
            from tkinter import messagebox
            window = tk.Tk(); window.withdraw()
            messagebox.showerror("LangPlay", str(exception)); window.destroy()
        else:
            if sys.stderr is not None:
                print("LangPlay: " + str(exception), file=sys.stderr)
            else:
                import os
                import tempfile
                (Path(tempfile.gettempdir()) / f"langplay-setup-error-{os.getpid()}.log").write_text(str(exception), encoding="utf-8")
        sys.exit(1)
