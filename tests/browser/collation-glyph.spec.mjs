import { test, expect } from "@playwright/test";

test.describe("逐字校勘", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem("mingwenTai.workspace.v1"));
    await page.goto("/index.html");
    await page.locator('#sideTabs .tab[data-tab="collate"]').click();
  });

  test("四类结果齐全：相同 / 替换 / 增补 / 脱文（构造能同时产生四类的样本）", async ({ page }) => {
    // 甲：甲乙丙丁戊己
    // 乙：甲X丙戊卯己 → 乙→X 替换；丁 脱文；卯 增补；甲丙戊己 相同
    await page.evaluate(() => {
      const w = window.__mingwen;
      w.quickDoc("t-a", "测甲", "甲乙丙丁戊己");
      w.quickDoc("t-b", "测乙", "甲X丙戊卯己");
    });
    await page.locator("#panelCollate select").nth(0).selectOption("t-a");
    await page.locator("#panelCollate select").nth(1).selectOption("t-b");

    const statuses = await page.getByTestId("diff-row").evaluateAll((els) => els.map((e) => e.dataset.status));
    expect(statuses).toEqual(["same", "replace", "same", "delete", "same", "insert", "same"]);

    const rep = page.locator('[data-status="replace"]');
    await expect(rep.locator(".acell")).toContainText("乙");
    await expect(rep.locator(".bcell")).toContainText("X");
    await expect(page.locator('[data-status="insert"] .bcell')).toContainText("卯");
    await expect(page.locator('[data-status="delete"] .acell')).toContainText("丁");

    const summary = await page.getByTestId("collateSummary").textContent();
    expect(summary).toContain("相同 4");
    expect(summary).toContain("替换 1");
    expect(summary).toContain("增补 1");
    expect(summary).toContain("脱文 1");
  });

  test("样例抄本：元→二、年→祀、正→二识别为替换，「日」为脱文", async ({ page }) => {
    await page.locator("#panelCollate select").nth(0).selectOption("doc-jia");
    await page.locator("#panelCollate select").nth(1).selectOption("doc-yi");
    const pairs = await page.locator('[data-status="replace"]').evaluateAll((els) =>
      els.map((e) => [e.querySelector(".acell").textContent.trim()[0], e.querySelector(".bcell").textContent.trim()[0]])
    );
    expect(pairs).toContainEqual(["元", "二"]);
    expect(pairs).toContainEqual(["年", "祀"]);
    // 「正月吉·日」对「二月吉」：正↔二为替换、日为脱文（最优对齐下的判定）
    expect(pairs).toContainEqual(["正", "二"]);
    const dels = await page.locator('[data-status="delete"] .acell').allTextContents();
    expect(dels.some((t) => t.includes("日"))).toBe(true);
  });

  test("同一抄本比较时给出提示而非表格", async ({ page }) => {
    // 两个下拉初始为 甲=器铭、乙=抄本甲；把甲也选为抄本甲（用索引精确定位）
    const selects = page.locator("#panelCollate select");
    await selects.nth(0).selectOption("doc-jia");
    await selects.nth(1).selectOption("doc-jia");
    await expect(page.locator("#panelCollate")).toContainText("两份不同的抄本");
    await expect(page.getByTestId("collateTable")).toHaveCount(0);
  });
});

test.describe("字形索引", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem("mingwenTai.workspace.v1"));
    await page.goto("/index.html");
  });

  test("检索「王」可命中合文通读与单字，出处可跳转字位", async ({ page }) => {
    await page.locator('#sideTabs .tab[data-tab="glyph"]').click();
    await page.getByTestId("glyphSearch").fill("王");
    const chips = page.getByTestId("glyphGrid").locator(".glyph-chip");
    const first = chips.first();
    await expect(first).toHaveText(/王/);
    await first.click();
    const occ = page.getByTestId("occurrenceList");
    await expect(occ).toContainText("通读");
    await expect(occ).toContainText("第二列");
    // 点第一处出处，转录区对应字位被选中
    await occ.locator("li").first().click();
    const selected = await page.locator(".slot.selected").getAttribute("data-slot-id");
    expect(["b2", "b7"]).toContain(selected);
  });

  test("组合字符以整个字素簇作为索引键可检索", async ({ page }) => {
    // 把 b1 原貌与通读改为 e+U+0301
    await page.locator('[data-slot-id="b1"]').click();
    await page.getByTestId("faceInput").fill("é");
    await page.getByTestId("readingInput").fill("é");
    await page.locator('#sideTabs .tab[data-tab="glyph"]').click();
    await page.getByTestId("glyphSearch").fill("é");
    const chips = page.getByTestId("glyphGrid").locator(".glyph-chip");
    expect(await chips.count()).toBeGreaterThan(0);
    await expect(chips.first()).toContainText("é");
  });
});
