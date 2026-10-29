# CSV Plot Studio download page

A single static page for downloading [CSV Plot Studio](https://github.com/rolowhite/qwen_based_CSV-plotting-tool_3.3.0)
and reading or writing reviews. No build step.

* `index.html` (with its script inline) and `style.css`: the page. three.js comes from jsDelivr (pinned to 0.160.0).
* `assets/`: four screenshots from the app repo.
* The background is a 3D scatter of 3,600 dots. On each section it regroups into a model name
  (`MODELS` in the script in `index.html`) and moves in its own way (`MODES`: walk the grid, wave, orbit, flow field, drift).
  Moving the mouse shows the coordinates of the nearest grid node; clicking pushes the dots apart.

## Run it locally

The page loads JavaScript modules, so open it through a server, not as a file:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Publish it

GitHub Pages: Settings, Pages, deploy from the `main` branch, folder `/`.

## Switch on reviews (giscus)

Reviews use [giscus](https://giscus.app), which stores them as GitHub Discussions in the app repo.
Until it is set up, the page shows a link to open a review as a GitHub issue instead.

1. In `rolowhite/qwen_based_CSV-plotting-tool_3.3.0`: Settings, General, Features, tick **Discussions**.
2. Create a discussion category named **Reviews** (type: Announcements, so only giscus starts threads).
3. Install the giscus app on that repo: https://github.com/apps/giscus
4. On https://giscus.app enter the repo, pick the **Reviews** category and copy `data-category-id`.
5. Paste it into `categoryId` at the top of the script in `index.html`. The repo id is already filled in.

## Download link

Both buttons download the `main` branch as a ZIP:
`https://github.com/rolowhite/qwen_based_CSV-plotting-tool_3.3.0/archive/refs/heads/main.zip`.
To ship a release instead, change the two `href`s in `index.html` to the release asset URL.
