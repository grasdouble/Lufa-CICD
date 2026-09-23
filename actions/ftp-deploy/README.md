# ftp-deploy

Deploy a prepared directory using the pinned `SamKirkland/FTP-Deploy-Action`.
The calling job owns checkout, build commands, GitHub environments and secrets.
The wrapper does not build files or create a GitHub deployment record.

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `server` | Required | FTP server address |
| `port` | Required | FTP server port |
| `protocol` | Required | `ftp`, `ftps` or `ftps-legacy` |
| `username` | Required | FTP username |
| `password` | Required | FTP password |
| `local-dir` | Required | Local directory, ending with `/` |
| `server-dir` | `./` | Remote directory, ending with `/` |
| `exclude` | See below | One exclusion glob per line |

Default exclusions:

```text
**/.git*
**/.git*/**
**/node_modules/**
**/cgi-bin/**
```

Custom `exclude` input replaces these defaults. The action exposes no outputs.
Synchronization, state files and removal of previously deployed files follow
the upstream action's behavior; select the remote directory accordingly.

## Example

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      # Prepare ./dist/ in this job before deploying.
      - uses: grasdouble/Lufa-CICD/actions/ftp-deploy@ftp-deploy-v1
        with:
          server: ${{ secrets.FTP_SERVER }}
          port: ${{ secrets.FTP_PORT }}
          protocol: ftps
          username: ${{ secrets.FTP_USERNAME }}
          password: ${{ secrets.FTP_PASSWORD }}
          local-dir: ./dist/
          server-dir: ./site/
```

The action does not require a GitHub API token. Keep environment-specific
credentials in the consuming repository's GitHub environment.
