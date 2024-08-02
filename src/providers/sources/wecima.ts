import cheerio from 'cheerio';

import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

// Function to extract video quality from a URL
function extractQuality(url: string): string {
  const match = url.match(/(\d{3,4})p/);
  return match ? match[1] : 'unknown';
}

// Function to format the title by replacing spaces with hyphens
function formatTitle(title: string): string {
  return title.split(' ').join('-');
}

function constructMovieUrl(title: string, releaseYear: number): string {
  return `https://wecima.show/watch/مشاهدة-فيلم-${title}-${releaseYear}/`;
}

function constructSeriesUrl(title: string, season: number, episode: number): string {
  return `https://wecima.show/watch/مشاهدة-مسلسل-${title}-موسم-${season}-حلقة-${episode}`;
}

// Function to scrape download links from a given URL
async function scrapeDownloadLinks(
  url: string,
  fetcher: (url: string) => Promise<{ data: string; statusCode: number; headers: any }>,
): Promise<string[]> {
  try {
    let currentUrl = url;
    let response = await fetcher(currentUrl);
    while (response.statusCode === 301 || response.statusCode === 302) {
      currentUrl = response.headers.location;
      response = await fetcher(currentUrl);
    }

    const { data } = response;
    const $ = cheerio.load(data);

    // Extract download links
    const downloadLinks: string[] = [];
    $('ul.List--Download--Wecima--Single li a').each((_, element) => {
      const href = $(element).attr('href');
      if (href) {
        downloadLinks.push(href);
      }
    });

    return downloadLinks;
  } catch (error: any) {
    throw new Error(`Error scraping download links: ${error.message}`);
  }
}

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  let progress = 0;
  const interval = setInterval(() => {
    progress += 1;
    ctx.progress(progress);
  }, 100);

  let url: string;
  if (ctx.media.type === 'movie') {
    url = constructMovieUrl(formatTitle(ctx.media.title), ctx.media.releaseYear);
  } else {
    url = constructSeriesUrl(formatTitle(ctx.media.title), ctx.media.season.number, ctx.media.episode.number);
  }

  try {
    const downloadLinks = await scrapeDownloadLinks(url, ctx.fetcher);
    ctx.progress(100);

    if (downloadLinks.length > 0) {
      const qualities: { [key: string]: { type: string; url: string } } = {};

      downloadLinks.forEach((link) => {
        const quality = extractQuality(link);
        qualities[quality] = { type: 'mp4', url: link };
      });

      const stream = [
        {
          id: 'primary',
          captions: [],
          qualities,
          type: 'file',
          flags: [],
        },
      ];

      return { embeds: [], stream } as SourcererOutput;
    }
    throw new NotFoundError('No download links found');
  } catch (error: any) {
    ctx.progress(100);
    throw new NotFoundError(error.message);
  } finally {
    clearInterval(interval);
  }
}

export const wecimaScraper = makeSourcerer({
  id: 'wecima',
  name: 'Wecima',
  rank: 150,
  disabled: false,
  flags: [flags.CORS_ALLOWED],
  scrapeShow: comboScraper,
  scrapeMovie: comboScraper,
});
