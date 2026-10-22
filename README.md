# topdf

An HTTP server that turns HTML, web pages, images, Markdown and plain text into PDF. Send one file, or several in one request, and get one PDF back. Everything is printed by headless Chromium, so there is nothing else to install.

- **HTML and web pages** are printed by headless Chromium (through Playwright), so CSS, web fonts and JavaScript work the way they do in a browser.
- **Images** (PNG, JPEG, GIF, WebP, SVG, BMP, AVIF) each go on their own page, centred and scaled down to fit.
- **Markdown** is rendered GitHub-style, with tables, code blocks and task lists. **Plain text** is printed in a monospace font, with long lines wrapped.
- **PDFs** are passed through, so they can be merged with the rest.

## Run it

With Node 22 or later:

```sh
npm ci
npx playwright install chromium
npm run build && npm start      # or `npm run dev` to reload on changes
```

## Convert

Everything goes to `POST /convert`, and the response is the PDF (`application/pdf`).

**A file as the request body.** topdf works out the file type from `?type=`, `?filename=`, the `Content-Type` header, or failing those, the file's first bytes:

```sh
curl --data-binary @report.html -H 'Content-Type: text/html' localhost:8080/convert -o report.pdf
curl --data-binary @photo.jpg   -H 'Content-Type: image/jpeg' localhost:8080/convert -o photo.pdf
curl --data-binary @README.md   'localhost:8080/convert?filename=README.md' -o readme.pdf
curl --data-binary @notes.txt   'localhost:8080/convert?filename=notes.txt&paper=Letter' -o notes.pdf
```

**A web page:**

```sh
curl -X POST 'localhost:8080/convert?url=https://example.com' -o page.pdf
curl -H 'Content-Type: application/json' \
  -d '{"url": "https://example.com", "options": {"media": "screen", "waitUntil": "networkidle"}}' \
  localhost:8080/convert -o page.pdf
```

**Text in a JSON body.** The body takes exactly one of `html`, `markdown`, `text` or `url`:

```sh
curl -H 'Content-Type: application/json' \
  -d '{"markdown": "# Invoice\n\n| Item | Price |\n|---|---|\n| Tea | 4 |", "options": {"paper": "A5"}}' \
  localhost:8080/convert -o invoice.pdf
```

**Several inputs merged into one PDF.** Send a `multipart/form-data` upload. Every `file` part and `url` field is converted in the order sent, and the results are joined:

```sh
curl -F file=@cover.html -F file=@scan-1.png -F file=@scan-2.png \
     -F url=https://example.com/terms -F file=@appendix.pdf \
     -F paper=Letter localhost:8080/convert -o bundle.pdf
```

In a multipart upload, options can be separate fields (as `paper` is above) or a single JSON field: `-F 'options={"margin":"0"}'`.

The PDF is named after the first file, or after `filename` when given: `Content-Disposition: attachment; filename="cover.pdf"`.

### Options

Options can be given as query parameters, as multipart fields, or in the JSON `options` object. Unknown options are refused, so a typo never goes unnoticed.

| Option       | Default | Values                                                                  |
| ------------ | ------- | ----------------------------------------------------------------------- |
| `paper`      | `A4`    | `A3`, `A4`, `A5`, `Letter`, `Legal`, `Tabloid`                          |
| `landscape`  | `false` | `true` / `false`                                                        |
| `margin`     | `1cm`   | a length applied to all four sides: `0`, `10mm`, `1cm`, `0.5in`, `20px` |
| `background` | `true`  | print background colours and images                                     |
| `scale`      | `1`     | `0.1` to `2`                                                            |
| `media`      | `print` | `print`, or `screen` to keep a page's on-screen styles                  |
| `waitUntil`  | `load`  | `load`, `domcontentloaded`, or `networkidle` for pages that load late   |

### Errors

Errors come back as JSON with a short `error` code, a readable `message`, and the `requestId` (also sent as the `X-Request-ID` header, which you can set yourself):

```json
{ "error": "unsupported_type", "message": "Could not tell what kind of file this is…", "requestId": "…" }
```

| Status | When                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------- |
| 400    | a malformed request or bad options                                                              |
| 401    | an API key is set and the request did not send it                                               |
| 413    | the upload is over `TOPDF_MAX_BODY_MB`, or has more than `TOPDF_MAX_FILES` files                |
| 415    | the file type is unknown or not supported                                                       |
| 422    | the input was understood but could not be converted: a broken file, or a page answering 4xx/5xx |
| 503    | the server is busy past `TOPDF_QUEUE_TIMEOUT_MS`, or Chromium could not start                   |
| 504    | a conversion took longer than `TOPDF_TIMEOUT_MS`                                                |

### Health

`GET /health` returns the formats topdf converts and how busy it is:

```json
{ "status": "ok", "formats": ["html", "url", "markdown", "text", "image", "pdf"], "load": { "active": 1, "queued": 0, "size": 4 } }
```

## Configuration

Every setting is an environment variable, and every one has a default.

| Variable                    | Default            | What it does                                                                        |
| --------------------------- | ------------------ | ----------------------------------------------------------------------------------- |
| `PORT` / `HOST`             | `8080` / `0.0.0.0` | where the server listens                                                            |
| `TOPDF_API_KEY`             | unset              | when set, `/convert` needs `Authorization: Bearer <key>` or `X-API-Key: <key>`      |
| `TOPDF_MAX_BODY_MB`         | `25`               | the largest upload, across all its files                                            |
| `TOPDF_MAX_FILES`           | `20`               | the most files and URLs in one request                                              |
| `TOPDF_TIMEOUT_MS`          | `60000`            | how long one input may take to load and print                                       |
| `TOPDF_QUEUE_TIMEOUT_MS`    | `30000`            | how long a request waits for a free slot before getting `503`                       |
| `TOPDF_BROWSER_CONCURRENCY` | `4`                | pages printed at once (one Chromium, one isolated context per page)                 |
| `TOPDF_LOG_LEVEL`           | `info`             | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`; logs are JSON lines |

## Security

topdf is meant to run as an internal service, for clients you trust. The pages it prints can reach anything the server can: a `url`, or an image or `fetch()` inside submitted HTML, may point at other services on your network. That is useful for printing internal pages, but it means topdf must not be exposed to the internet or to untrusted users.

- **No access to local files.** Pages cannot read `file://` URLs.
- **Every conversion is isolated.** Each page gets a fresh browser context, so cookies, storage and cache are never shared, and downloads and service workers are off.
- **`TOPDF_API_KEY`** limits who on the network can use it.

## Development

```sh
npm run dev         # watch mode
npm run typecheck   # the server and the tests
npm run lint        # ESLint
npm run format      # Prettier; CI fails on unformatted code (`npm run format:check`)
npm test            # unit tests, plus real Chromium conversions when it is installed
```

The tests that use Chromium are skipped when it has not been downloaded; CI installs it, so it runs every test.

```
src/
  server.ts       starts everything from the environment
  app.ts          the HTTP routes, errors and API key check
  inputs.ts       reads a request into inputs and options
  formats.ts      works out what a file is
  options.ts      page options and their checks
  limiter.ts      the concurrency limit and queue timeout
  convert/
    index.ts      picks the converter for each input and merges the results
    browser.ts    Chromium: HTML and URLs
    documents.ts  Markdown, text and images as HTML
    merge.ts      joining PDFs
```

## License

[MIT](LICENSE)
