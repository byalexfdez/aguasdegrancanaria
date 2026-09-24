import fs from 'node:fs'; import * as cheerio from 'cheerio';
const [,, slugOrig, url] = process.argv;
const orig = fs.readFileSync(`migracion/texto-plano/${slugOrig}.txt`, 'utf8');
const html = fs.readFileSync(`dist${url}index.html`, 'utf8');
const $ = cheerio.load(html); $('script,style,noscript,template,[aria-hidden="true"]').remove();
const nuevo = $('#contenido').text().replace(/\s+/g, ' ');
console.log('ORIG:', orig.slice(0, 700)); console.log('\nNUEVO:', nuevo.slice(0, 900));
