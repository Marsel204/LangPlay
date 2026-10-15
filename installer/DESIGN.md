---
name: LangPlay Setup
description: A native desktop setup utility for Seanime and LangPlay
spacing:
  window: "28px"
  controls: "8px"
  groups: "16px"
typography:
  title:
    fontSize: "23pt"
    fontWeight: 700
---

# Setup window

## Overview

Mode: Operate. Follow native desktop conventions with Tk/ttk widgets, system
colors, and system fonts. This is a focused setup utility, not a redesign of
LangPlay's learning interface.

Use one resizable window, at least 700 × 590 initially. Its actual requested size
and minimum height grow with the platform's font metrics. A clear
product title leads into a short explanation, a labelled library path with
Browse, the download/probe limitations, status, progress, and a selectable log.
Close and Install/Retry/Launch form the final action row. Disable folder editing
and repeated submission during work; preserve the chosen existing library on a
rerun. Errors remain visible with Retry. Use native keyboard focus and dialogs.

## Layout and typography

Spacing: 28 px window padding; 6–8 px between related controls; 12–16 px between
groups. Title: 23 pt bold; all operating text uses the desktop default. Text wraps
and the log expands with the window. No decorative assets or animation beyond
the native indeterminate progress indicator. Installation and startup run in
worker threads; Tk updates stay on the main thread.

## Verification limits

The mechanical detector reported no findings for the Python window source.
Native screenshot capture is unavailable in this agent session, so the visual
finish review is `recapture` pending Linux and Windows window captures. Do not
represent the source review or functional tests as a completed visual review.
