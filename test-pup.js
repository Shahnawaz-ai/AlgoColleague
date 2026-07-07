const puppeteer = require('puppeteer');

(async () => {
  try {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({ headless: false });
    console.log('Browser launched!');
    const page = await browser.newPage();
    console.log('Page created!');
    await page.goto('https://example.com');
    console.log('Navigation complete!');
    await browser.close();
    console.log('Success');
  } catch (e) {
    console.error('Error:', e);
  }
})();
