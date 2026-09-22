# WebCraft

WebCraft is a standalone browser client based on the EaglerCraftX 1.20 WASM-GC release.
It runs from a single HTML file and is suitable for GitHub Pages.

## Run locally

Open `index.html` in a modern browser, or serve this directory with any static HTTP server:

```sh
python3 -m http.server 8080
```

The client uses the relay configuration included in the HTML file. Worlds are saved locally in the browser.

## Credits and license

The bundled client is from [JaydenYoriTheBeast/EaglerCraftX-1.20-File-html](https://github.com/JaydenYoriTheBeast/EaglerCraftX-1.20-File-html).
See `LICENSE` for the upstream license.
