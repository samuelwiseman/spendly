import { expect, test } from "@playwright/test";

// One SQLite file is shared by every test in this run, so state accumulates and
// order matters. Serial mode makes that explicit rather than accidental.
test.describe.configure({ mode: "serial" });

const month = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London", year: "numeric", month: "2-digit",
}).format(new Date()).slice(0, 7);

test.beforeEach(async ({ page }) => {
  await page.goto("/test-login?who=alice");
});

test("unauthenticated visitors are sent to login", async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: /Continue with Google/ })).toBeVisible();
});

test("an empty month reads zero", async ({ page }) => {
  await expect(page.locator(".hero")).toHaveText("£0.00");
  await expect(page.getByText("No spending recorded this month")).toBeVisible();
});

test("create, edit and delete an entry", async ({ page }) => {
  await page.goto(`/entries?month=${month}`);

  await page.getByRole("button", { name: "Add entry" }).click();
  const add = page.locator("dialog[open]");
  await add.getByLabel("Name").fill("Rent");
  await add.getByLabel("Amount (£)").fill("950.00");
  await add.getByLabel("Category").selectOption("need");
  await add.getByLabel("Date").fill(`${month}-01`);
  await add.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Rent")).toBeVisible();
  await expect(page.getByText("£950.00")).toBeVisible();

  await page.goto(`/?month=${month}`);
  await expect(page.locator(".hero")).toHaveText("£950.00");
  await expect(page.getByText("0% discretionary")).toBeVisible();

  await page.goto(`/entries?month=${month}`);
  await page.getByRole("button", { name: "Edit" }).click();
  const edit = page.locator("dialog[open]");
  await edit.getByLabel("Amount (£)").fill("960.00");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("£960.00")).toBeVisible();

  await page.getByRole("button", { name: "Delete Rent" }).click();
  await expect(page.getByText("Nothing recorded this month.")).toBeVisible();
});

test("an invalid amount keeps the dialog open and explains why", async ({ page }) => {
  await page.goto(`/entries?month=${month}`);
  await page.getByRole("button", { name: "Add entry" }).click();
  const form = page.locator("dialog[open]");
  await form.getByLabel("Name").fill("Nonsense");
  await form.getByLabel("Amount (£)").fill("abc");
  await form.getByLabel("Date").fill(`${month}-01`);
  await form.getByRole("button", { name: "Save" }).click();

  await expect(form.getByRole("alert")).toContainText("Amount must be a number");
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("one user cannot see another user's entries", async ({ page }) => {
  await page.goto(`/entries?month=${month}`);
  await page.getByRole("button", { name: "Add entry" }).click();
  const form = page.locator("dialog[open]");
  await form.getByLabel("Name").fill("Alice private");
  await form.getByLabel("Amount (£)").fill("10.00");
  await form.getByLabel("Date").fill(`${month}-01`);
  await form.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Alice private")).toBeVisible();

  await page.goto("/test-login?who=bob");
  await page.goto(`/entries?month=${month}`);
  await expect(page.getByText("Alice private")).toHaveCount(0);
  await expect(page.getByText("Nothing recorded this month.")).toBeVisible();
});

test("the chart tooltip is reachable by keyboard", async ({ page }) => {
  await page.goto(`/entries?month=${month}`);
  await page.getByRole("button", { name: "Add entry" }).click();
  const form = page.locator("dialog[open]");
  await form.getByLabel("Name").fill("Trainers");
  await form.getByLabel("Amount (£)").fill("130.00");
  await form.getByLabel("Category").selectOption("luxury");
  await form.getByLabel("Date").fill(`${month}-06`);
  await form.getByRole("button", { name: "Save" }).click();

  await page.goto(`/?month=${month}`);
  await page.getByRole("button", { name: /^Luxury:/ }).focus();
  await expect(page.locator(".tip")).toContainText("Luxury");
});

test("the table view carries the same numbers as the bar", async ({ page }) => {
  await page.goto(`/?month=${month}`);
  await page.getByText("View as table").click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("row", { name: /Luxury/ })).toContainText("£130.00");
});

// The negative case — that /test-login 404s when TEST_AUTH_BYPASS is unset — cannot be
// asserted here, because this whole suite requires the flag to be on. It is verified
// against the deployed server in Task 11, Step 11. That check is not optional.
test("the test-login route redirects when the bypass flag is set", async ({ request }) => {
  const response = await request.get("/test-login?who=carol", { maxRedirects: 0 });
  expect(response.status()).toBe(302);
});
