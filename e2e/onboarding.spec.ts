import { test, expect } from "@playwright/test";

test.describe("Onboarding Flow", () => {
  test("landing page renders and links to onboarding", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=PathFinder")).toBeVisible();
    await expect(page.locator("text=Get Started")).toBeVisible();
  });

  test("landing page has nav links", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('a[href="/dashboard"]')).toBeVisible();
    await expect(page.locator('a[href="/onboarding"]')).toBeVisible();
  });

  test("onboarding welcome screen loads", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page.locator("text=Welcome to PathFinder")).toBeVisible();
    await expect(page.locator("text=Meet Nexus, your coach")).toBeVisible();
  });

  test("onboarding has name input field", async ({ page }) => {
    await page.goto("/onboarding");
    const input = page.locator('input[placeholder="Your name"]');
    await expect(input).toBeVisible();
  });

  test("onboarding start button is disabled without name", async ({ page }) => {
    await page.goto("/onboarding");
    const button = page.locator("text=Meet Nexus, your coach");
    await expect(button).toBeVisible();
    // Button should be disabled when name is empty
    await expect(button).toBeDisabled();
  });

  test("can type name and see it in input", async ({ page }) => {
    await page.goto("/onboarding");
    const input = page.locator('input[placeholder="Your name"]');
    await input.fill("Test User");
    await expect(input).toHaveValue("Test User");
  });

  test("start button enables after typing name", async ({ page }) => {
    await page.goto("/onboarding");
    const input = page.locator('input[placeholder="Your name"]');
    const button = page.locator("button:has-text('Meet Nexus, your coach')");

    await input.fill("Test User");
    await expect(button).toBeEnabled();
  });

  test("stepper stages are visible on onboarding page", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page.locator("text=Welcome")).toBeVisible();
    await expect(page.locator("text=Interview")).toBeVisible();
    await expect(page.locator("text=Evidence")).toBeVisible();
    await expect(page.locator("text=Calibration")).toBeVisible();
    await expect(page.locator("text=Roadmap")).toBeVisible();
  });

  test("progress bar is visible", async ({ page }) => {
    await page.goto("/onboarding");
    const progress = page.locator('[role="progressbar"], .h-1').first();
    await expect(progress).toBeVisible();
  });

  test("onboarding description text is shown", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page.locator("text=Ten minutes from now")).toBeVisible();
    await expect(page.locator("text=No accounts, no passwords")).toBeVisible();
  });
});

test.describe("Landing Page", () => {
  test("hero section renders", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Nexus: The AI Learning Coach")).toBeVisible();
    await expect(page.locator("text=Begin Your Journey")).toBeVisible();
  });

  test("feature cards render", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Skill Calibration")).toBeVisible();
    await expect(page.locator("text=Dynamic Roadmaps")).toBeVisible();
    await expect(page.locator("text=GitHub Forensics")).toBeVisible();
  });

  test("footer renders", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=PathFinder — built for the AI hackathon")).toBeVisible();
  });

  test("navigation to /onboarding works", async ({ page }) => {
    await page.goto("/");
    await page.click('a[href="/onboarding"]');
    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.locator("text=Welcome to PathFinder")).toBeVisible();
  });
});
