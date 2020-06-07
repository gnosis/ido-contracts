# Easy Auction Front-end

## Development

### Install Dependencies

```bash
yarn
```

### Configure Environment (optional)

Copy `.env` to `.env.local` and change the appropriate variables.

### Run

```bash
yarn start
```

To have the frontend default to a different network, make a copy of `.env` named `.env.local`,
change `REACT_APP_NETWORK_ID` to `"{yourNetworkId}"`, and change `REACT_APP_NETWORK_URL` to e.g.
`"https://{yourNetwork}.infura.io/v3/{yourKey}"`.

## Contributions

**Please open all pull requests against the `v2` branch.**
CI checks will run against all PRs.
