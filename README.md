# CSV Plot Studio download page

A single static page for downloading [CSV Plot Studio](https://github.com/rolowhite/qwen_based_CSV-plotting-tool_3.3.0)
and reading or writing reviews. No build step.

* `index.html` (with its script inline) and `style.css`: the page. three.js comes from jsDelivr (pinned to 0.160.0).
* `assets/`: four screenshots from the app repo.
* The background is a 3D grid with its origin (0, 0, 0) at the bottom left, and 3,900 grey points:
  * A coral line from the origin follows the mouse as a regression line; 900 points sit around it as its
    residuals and trail it as it turns. The label by the cursor shows the grid coordinates and the fit.
  * Scrolling draws a bell curve from left to right, complete at the bottom of the page. The other 3,000
    points roam the grid until the curve reaches them, then pile up on it, spread along z.
  * Clicking pushes the points apart.

## Run it locally

Double-click `index.html`, or serve the folder:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. It needs the internet for three.js and the fonts.

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
