# Publishing ThomasLab

## One-time activation

1. Commit and push the new workflow, staging script, and documentation to `main` using GitHub Desktop as usual.
2. Open [this repository's Pages settings](https://github.com/Tommyblockhead20/ThomasLab/settings/pages). Under **Build and deployment → Source**, choose **GitHub Actions**. Keep the existing custom domain `thomaslab.me`.
3. Open [Actions](https://github.com/Tommyblockhead20/ThomasLab/actions), select **Build and publish ThomasLab**, and choose **Run workflow** on `main` for the first publication. This is also how to retry after changing the Pages setting if the first automatic run reached deployment too early.

After activation, **commit and push to `main`**. GitHub installs the locked dependencies, builds Bass Camp, prepares the full website, and publishes it. You no longer need to run `npm run build` yourself before updating GitHub. The workflow also validates pull requests without publishing them. A failed build or staging check prevents its deployment.

The workflow does not commit generated files back to the repository. Existing committed `BassCamp` files can remain as a local snapshot; the live site always gets the build made from the pushed source. Changes to the landing page and the other projects publish through the same workflow.

## Working on Bass Camp

- Open the **ThomasLab repository root**, even in a chat focused only on Bass Camp.
- Edit game source in **`ReelAscent/`**. Its older folder name remains for now.
- **`BassCamp/` is generated output.** Direct changes there are overwritten by the next build.
- The game uses shared files at the repository root, and the build writes to its sibling `BassCamp` directory. Giving a chat only the output folder would hide the source it needs.

For local iteration, open a terminal in `ReelAscent` and run `npm run dev`. The development server updates as source files change. A one-time `npm ci` is needed on a fresh checkout. To preview the production output locally, `npm run build` is still available; it is optional for publishing after GitHub Actions is activated.

## Workflow details

- Configuration: `.github/workflows/pages.yml`.
- Runtime: Node.js 24; dependency versions come from `ReelAscent/package-lock.json`.
- Packaging: `node scripts/stage-pages.mjs` creates the ignored `_site/` directory. It copies tracked website files plus the freshly built Bass Camp output, checks project entrances and game asset references, and excludes installed dependencies and Git internals. It replaces only an output directory carrying its own generated marker.
- Only the deployment job receives Pages publishing permissions. GitHub supplies its temporary token; no personal access token is required.
- The GitHub actions are pinned to verified commits. Update those pins deliberately when maintaining the workflow.

Official reference: [Using custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
