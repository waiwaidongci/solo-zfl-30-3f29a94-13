import { test, expect } from "@playwright/test";

// 真实浏览器几何核验：组合字占一个字位、双向文本视觉重排、竖排右至左版面。
test.describe("书写几何", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem("mingwenTai.workspace.v1"));
    await page.goto("/index.html");
  });

  test("组合字符（基本字+组合记号）只占一个字位，渲染宽度小于两个独立字", async ({ page }) => {
    // 选中第一列第一个字位 b1（隹）
    await page.locator('[data-slot-id="b1"]').click();
    const face = page.getByTestId("faceInput");
    await face.fill("é"); // e + U+0301
    await expect(page.getByTestId("faceHint")).toContainText("字素簇数：1");

    const widthCombining = await page.evaluate(() => {
      const glyph = document.querySelector('[data-slot-id="b1"] .glyph');
      return glyph.getBoundingClientRect().width;
    });

    await face.fill("ab");
    await expect(page.getByTestId("faceHint")).toContainText("字素簇数：2");
    const widthTwo = await page.evaluate(() => document.querySelector('[data-slot-id="b1"] .glyph').getBoundingClientRect().width);

    expect(widthCombining).toBeLessThan(widthTwo * 0.85);

    // 代理对单字同样按 1 个字素簇
    await face.fill("\u{23A98}");
    await expect(page.getByTestId("faceHint")).toContainText("字素簇数：1");
  });

  test("合文通读串中的双向文本发生视觉重排且逻辑次序不变", async ({ page }) => {
    // 横排抄本：把第二字位转为合文，通读串为 阿拉伯文 + 空格 + 拉丁（首强字符为阿拉伯文 → RTL 段）
    await page.selectOption("#docSelect", "doc-jia");
    await page.locator('[data-slot-id="jia-s2"]').click();
    await page.getByTestId("typeSelect").selectOption("ligature");
    await page.getByTestId("readingInput").fill("أبجد ABC");
    const geom = await page.evaluate(() => {
      const tag = document.querySelector('[data-slot-id="jia-s2"] .reading-tag');
      const text = tag.firstChild;
      const rangeAr = new Range();
      const rangeLa = new Range();
      rangeAr.setStart(text, 0); rangeAr.setEnd(text, 4); // أبجد（均 BMP）
      rangeLa.setStart(text, 5); rangeLa.setEnd(text, 8); // ABC
      const ar = rangeAr.getBoundingClientRect();
      const la = rangeLa.getBoundingClientRect();
      return { arLeft: ar.left, arRight: ar.right, laLeft: la.left, laRight: la.right, logical: tag.textContent };
    });
    // RTL 段：阿拉伯文视觉在右，拉丁在左；DOM 逻辑次序不变
    expect(geom.arLeft).toBeGreaterThan(geom.laRight);
    expect(geom.logical).toBe("أبجد ABC");
  });

  test("竖排右至左：录入第一列出现在最右，列内自上而下", async ({ page }) => {
    const cols = page.locator(".line-block");
    const box1 = await cols.nth(0).boundingBox();
    const box2 = await cols.nth(1).boundingBox();
    const box3 = await cols.nth(2).boundingBox();
    expect(box1.x).toBeGreaterThan(box2.x); // row-reverse：第一列最右
    expect(box2.x).toBeGreaterThan(box3.x);

    const slots = page.locator('[data-line-id="bronze-l1"] .slot');
    const y1 = (await slots.nth(0).boundingBox()).y;
    const y2 = (await slots.nth(1).boundingBox()).y;
    expect(y2).toBeGreaterThan(y1); // 列内自上而下
  });

  test("横排右至左：字位视觉次序与录入次序相反", async ({ page }) => {
    // 切到抄本甲（横排左至右）先取位置，再把版面改成横排右至左
    await page.selectOption("#docSelect", "doc-jia");
    await page.selectOption("#modeSelect", "horizontalRl");
    const slots = page.locator(".line-slots .slot");
    const x0 = (await slots.nth(0).boundingBox()).x;
    const x1 = (await slots.nth(1).boundingBox()).x;
    expect(x1).toBeLessThan(x0); // 第二个录入字位视觉上在左
  });

  test("合文、缺字占位、缺损标记正确显示", async ({ page }) => {
    const ligature = page.locator('[data-slot-id="b2"]');
    await expect(ligature).toHaveClass(/ligature/);
    await expect(ligature.locator(".reading-tag")).toHaveText("文王");

    const missing = page.locator('[data-slot-id="b4"]');
    await expect(missing).toHaveClass(/missing/);
    expect(await missing.locator(".glyph").textContent()).toContain("□");
    expect(missing).toHaveAttribute("data-defect", "泐");

    const residual = page.locator('[data-slot-id="b9"]');
    expect(residual).toHaveAttribute("data-defect", "残");
  });
});
