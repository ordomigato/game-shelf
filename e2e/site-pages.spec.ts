import { expect, test } from './fixtures'

test('the footer links to About, Privacy and the contact address', async ({
  page,
}) => {
  await page.goto('/login')
  const footer = page.getByRole('contentinfo')
  await expect(
    footer.getByText(`© ${new Date().getFullYear()} ThisPlayShelf`),
  ).toBeVisible()
  // Tests run a local build, which isn't a release.
  await expect(footer.getByTitle('Version')).toHaveText('dev')
  const links = footer.getByRole('navigation', { name: 'Site' })
  await expect(links.getByRole('link', { name: 'About' })).toHaveAttribute(
    'href',
    '/about',
  )
  await expect(links.getByRole('link', { name: 'Privacy' })).toHaveAttribute(
    'href',
    '/privacy',
  )
  await expect(links.getByRole('link', { name: 'Contact' })).toHaveAttribute(
    'href',
    '/contact',
  )
})

test('About introduces the developer and says it is free', async ({ page }) => {
  await page.goto('/about')
  await expect(
    page.getByRole('heading', { level: 1, name: 'About' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: "It's free" })).toBeVisible()
  await expect(
    page.getByRole('main').getByRole('link', { name: 'jeremygervais.ca' }),
  ).toHaveAttribute('href', 'https://jeremygervais.ca')
  await expect(
    page
      .getByRole('main')
      .getByRole('link', { name: 'support@thisplayshelf.com' }),
  ).toBeVisible()
  await expect(page).toHaveTitle('About · ThisPlayShelf')
})

test('Privacy explains what is stored and links to Settings', async ({
  page,
  request,
}) => {
  await page.goto('/privacy')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Privacy' }),
  ).toBeVisible()
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Settings' }),
  ).toHaveAttribute('href', '/account/settings')
  // Rendered on the server, so search engines and previews can read it.
  const html = await (await request.get('/privacy')).text()
  expect(html).toContain('Amazon Cognito')
})

test('Contact shows the address to copy or email', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/contact')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Contact' }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Send an email' }),
  ).toHaveAttribute('href', 'mailto:support@thisplayshelf.com')
  await page.getByRole('button', { name: 'Copy' }).click()
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'support@thisplayshelf.com',
  )
})

test('the footer credits IGDB, as their terms ask', async ({ page }) => {
  await page.goto('/about')
  const credit = page
    .getByRole('contentinfo')
    .getByRole('link', { name: 'IGDB' })
  await expect(credit).toHaveAttribute('href', 'https://www.igdb.com')
})
