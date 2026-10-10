# fonts

Everything here is served from this site. Nothing is fetched from anyone else while you study.

The site is set in Eiko (Pangram Pangram) in four weights:

- Eiko Thin (100) for the big titles
- Eiko ExtraLight (200) for handwritten-feeling asides
- Eiko Light (300) for body text
- Eiko Medium (500) for small labels, buttons and stamps

Eiko is a paid font, so it is not in this folder. Drop your licensed files in here as

    Eiko-Thin.woff2        Eiko-ExtraLight.woff2
    Eiko-Light.woff2       Eiko-Medium.woff2

(`.otf` or `.ttf` work too), or let the script rename them for you:

    python3 scripts/add-fonts.py ~/Downloads/your-eiko-folder

Until the files are here the site falls back to a similar system serif.
Japanese text always uses your computer's own Japanese fonts (Hiragino on a Mac).
