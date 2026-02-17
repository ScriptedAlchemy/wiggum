# Wiggum demo app

## Setup

Install the dependencies:

```bash
pnpm install
```

## Get started

Start the dev server, and the app will be available at [http://localhost:3000](http://localhost:3000).

```bash
pnpm dev
```

This demo includes `@wiggum/rsbuild-plugin-wiggum`, so the floating widget is injected automatically in development.

Build the app for production:

```bash
pnpm build
```

Preview the production build locally:

```bash
pnpm preview
```

## Testing

Run unit tests:

```bash
pnpm test
```

Run Playwright e2e tests:

```bash
# one-time browser install
pnpm exec playwright install chromium

# run e2e
pnpm test:e2e
```

The e2e suite includes coverage for the browser widget API (`window.WiggumChatWidget.open/close/isOpen`).

## Learn more

To learn more about Rsbuild, check out the following resources:

- [Rsbuild documentation](https://rsbuild.rs) - explore Rsbuild features and APIs.
- [Rsbuild GitHub repository](https://github.com/web-infra-dev/rsbuild) - your feedback and contributions are welcome!
