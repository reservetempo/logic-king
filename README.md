# Lords & Logicians

A small browser prototype where logic gates are medieval people. Hob Wickfoot carries a torch (lit = 1, dark = 0) down the road, Lord Gainsay the NOT gate overturns it, and the beacon at the road's end lights only if Hob arrives with his torch lit.

- Play: https://reservetempo.github.io/logic-king/
- Design notes (the book of characters): https://reservetempo.github.io/logic-king/design/

It is plain HTML, CSS and JavaScript modules with no build step. Three.js loads from jsDelivr through an import map.

## Run locally

ES modules don't load from `file://`, so serve the folder over HTTP:

```sh
python -m http.server 8000
```

Then open http://localhost:8000/ (the design notes are at http://localhost:8000/design/).
