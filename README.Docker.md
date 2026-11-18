### Building and running your application

When you're ready, start your application by running:
`docker compose up --build`.

Your application will be available at http://localhost:3000.

The image uses Node 24 and `npm ci`. The lockfile metadata for optional and peer
dependencies depends on the npm version and platform that wrote it — a local
`npm install` on macOS drops the optional peer `@capacitor/core` (via
`nostr-signer-capacitor-plugin`) and bundled `@emnapi/*` entries, which makes
`npm ci` fail on Linux. The build therefore re-derives that metadata with
`npm install --package-lock-only` before `npm ci`, so any lockfile your local
npm produced builds; resolved versions still come from the lockfile.
To refresh it on the build platform yourself:
`docker run --rm -v "$PWD:/app" -w /app node:24-alpine npm install --package-lock-only --ignore-scripts`.

### Deploying your application to the cloud

First, build your image, e.g.: `docker build -t bouquet .`.
If your cloud uses a different CPU architecture than your development
machine (e.g., you are on a Mac M1 and your cloud provider is amd64),
you'll want to build the image for that platform, e.g.:
`docker build --platform=linux/amd64 -t bouquet .`.

Then, push it to your registry, e.g. `docker push myregistry.com/bouquet`.

Consult Docker's [getting started](https://docs.docker.com/go/get-started-sharing/)
docs for more detail on building and pushing.

### References
* [Docker's Node.js guide](https://docs.docker.com/language/nodejs/)