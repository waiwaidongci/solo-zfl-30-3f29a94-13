import { test, expect } from "@playwright/test";

// 插删重排后批注仍锚定原字符；删除锚定字符后校验逐项报告悬空与越界。
test.describe("批注锚定与结构增删", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem("mingwenTai.workspace.v1"));
    await page.goto("/index.html");
  });

  test("行中插入新字位后，既有批注锚点跟随原字符（序号变化、uid 不变）", async ({ page }) => {
    // 初始：ann-cross-char 锚定 b3(才) 与 b4(缺字)
    const anchors = () => page.evaluate(() => {
      const { state } = window.__mingwen;
      const doc = state.workspace.docs.find((d) => d.id === "doc-bronze").doc;
      const ann = doc.annotations.find((a) => a.id === "ann-cross-char");
      return ann.anchorIds;
    });
    expect(await anchors()).toEqual(["b3", "b4"]);

    // 在第一列行首插入字位（点第一个 ＋）
    const firstLine = page.locator('[data-line-id="bronze-l1"] .line-slots');
    await firstLine.locator(".add-slot-here").first().click();
    const input = page.getByTestId("faceInput");
    await input.fill("新");

    // 数据层锚点仍是 b3/b4
    expect(await anchors()).toEqual(["b3", "b4"]);

    // 几何层：b3 从第 3 格变为第 4 格，且仍显示锚点序号 1
    const ords = await page.locator('[data-slot-id="b3"] .ord').allTextContents();
    expect(ords).toContain("1");
    const posB3 = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('[data-line-id="bronze-l1"] .slot')];
      return cells.findIndex((c) => c.dataset.slotId === "b3");
    });
    expect(posB3).toBe(3);
  });

  test("移位后批注锚点跟随到新位置，校验仍干净（检视器移动控件）", async ({ page }) => {
    // headless-shell 不触发原生 HTML5 拖放手势，故用检视器的「移动」验证同一重排逻辑。
    await page.locator('[data-slot-id="b5"]').click();
    await page.getByTestId("moveBtn").click(); // 默认目标行 bronze-l1、位置 0

    const order = await page.evaluate(() =>
      [...document.querySelectorAll('[data-line-id="bronze-l1"] .slot')].map((c) => c.dataset.slotId)
    );
    expect(order[0]).toBe("b5");
    // 批注 ann-cross-char 仍只锚 b3/b4，不悬空
    await page.locator('#sideTabs .tab[data-tab="issues"]').click();
    await expect(page.locator("#panelIssues")).toContainText(/未发现|校验结果（0）/);
  });

  test("删除被锚定的字位后：批注标记为悬空引用，问题可逐项定位到该批注", async ({ page }) => {
    await page.locator('[data-slot-id="b3"]').click();
    await page.getByTestId("deleteSlotBtn").click();

    await page.locator('#sideTabs .tab[data-tab="issues"]').click();
    const issue = page.locator('[data-code="DANGLING_ANNOTATION_REF"]', { hasText: "b3" }).first();
    await expect(issue).toBeVisible();
    // 顶栏徽标出现错误计数
    await expect(page.locator("#issueBadge")).not.toHaveClass(/hidden/);
    // 点击问题跳到批注面板，且该批注的悬空锚点以红色展示
    await issue.click();
    const danglingChip = page.locator('[data-annotation-id="ann-cross-char"] .tag.error-text').first();
    await expect(danglingChip).toBeVisible();
  });

  test("越界批注：声明限本行却把锚点点到另一行，校验逐项定位", async ({ page }) => {
    // 已有 ann-cross-line 锚 b6(第二列) 与 b11(第三列)、不限行；给它加上行范围 bronze-l2
    await page.locator('#sideTabs .tab[data-tab="annotations"]').click();
    const card = page.locator('[data-annotation-id="ann-cross-line"]');
    await card.locator("select").last().selectOption("bronze-l2");
    await page.locator('#sideTabs .tab[data-tab="issues"]').click();
    await expect(page.locator('[data-code="OUT_OF_BOUNDS_ANNOTATION"]').first()).toBeVisible();
  });

  test("互斥释读：同一字位采纳两个候选时报错定位到字位，取消后恢复干净", async ({ page }) => {
    await page.locator('[data-slot-id="b3"]').click();
    // b3 已有一个采纳候选「在」；直接在数据里再制造一个采纳并刷新
    await page.evaluate(() => {
      const { state, renderAll } = window.__mingwen;
      const hit = state.workspace.docs.find((d) => d.id === "doc-bronze").doc;
      const slot = hit.carriers[0].surfaces[0].lines[0].slots.find((s) => s.id === "b3");
      slot.candidates[1].chosen = true;
      renderAll();
    });
    await page.locator('#sideTabs .tab[data-tab="issues"]').click();
    await expect(page.locator('[data-code="MUTEX_READINGS"]')).toBeVisible();
    // 通过检视器只保留一个采纳（点第二个候选的 radio 会把其余置 false —— 改点第一个）
    await page.locator('[data-code="MUTEX_READINGS"]').click();
    const radios = page.getByTestId("candidateList").locator('input[type="radio"]');
    await radios.nth(0).check();
    await page.locator('#sideTabs .tab[data-tab="issues"]').click();
    await expect(page.locator('[data-code="MUTEX_READINGS"]')).toHaveCount(0);
  });

  test("批注文本中的非法校勘符号逐项报错并给出字素簇位置", async ({ page }) => {
    await page.locator('#sideTabs .tab[data-tab="issues"]').click();
    const before = await page.locator('[data-code="ILLEGAL_COLLATION_MARK"]').count();
    await page.locator('#sideTabs .tab[data-tab="annotations"]').click();
    const card = page.locator('[data-annotation-id="ann-cross-char"]');
    await card.getByTestId("annotationText").fill("疑在宗【误】");
    await page.locator('#sideTabs .tab[data-tab="issues"]').click();
    await expect(page.locator('[data-code="ILLEGAL_COLLATION_MARK"]')).toHaveCount(before + 2); // 【 与 】
  });
});
