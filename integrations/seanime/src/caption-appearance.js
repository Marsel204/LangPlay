// Keep the current glass tint unless the user explicitly chooses another value.
export const validCaptionOpacity = value => Number.isInteger(value) && value >= 0 && value <= 100;
export const captionOpacity = value => validCaptionOpacity(value) ? value : 18;
export const opacityLabel = value => `${value}%${value === 0 ? ' (Transparent)' : value === 100 ? ' (Solid)' : ''}`;
