import { flags } from '@/entrypoint/utils/targets';
import { makeSourcerer } from '@/providers/base';
import { Caption } from '@/providers/captions';
import { NotFoundError } from '@/utils/errors';

import { getCaptions } from './captions';
import { Season } from './types';

const insertUnitBase = 'https://insertunit.wafflehacker.io';

export const insertunitScraper = makeSourcerer({
  id: 'insertunit',
  name: 'Insertunit',
  disabled: false,
  rank: 60,
  flags: [flags.CORS_ALLOWED],
  async scrapeShow(ctx) {
    const playerData = await ctx.fetcher<string>(`index.php?imdb=${ctx.media.imdbId}`, {
      baseUrl: insertUnitBase,
    });
    ctx.progress(30);

    const seasonDataJSONregex = /seasons:\s*(\[\{[\s\S]*?\}\])/;
    const seasonDataMatch = seasonDataJSONregex.exec(playerData);

    if (!seasonDataMatch || !seasonDataMatch[1]) {
      console.error('No match for season data');
      throw new NotFoundError('No result found');
    }

    ctx.progress(60);

    let seasonTable: Season[];
    try {
      seasonTable = JSON.parse(seasonDataMatch[1]) as Season[];
    } catch (error) {
      console.error('Error parsing season data:', error);
      throw new NotFoundError('Error parsing season data');
    }

    const currentSeason = seasonTable.find(
      (seasonElement) => seasonElement.season === ctx.media.season.number && !seasonElement.blocked,
    );

    if (!currentSeason) {
      console.error('Season not found or blocked');
      throw new NotFoundError('Season not found or blocked');
    }

    const currentEpisode = currentSeason.episodes.find(
      (episodeElement) => episodeElement.episode === ctx.media.episode.number.toString(),
    );

    if (!currentEpisode?.hls) {
      console.error('Episode not found or no HLS stream available');
      throw new NotFoundError('Episode not found or no HLS stream available');
    }

    let captions: Caption[] = [];
    if (currentEpisode.cc) {
      captions = await getCaptions(currentEpisode.cc);
    }

    ctx.progress(95);

    return {
      embeds: [],
      stream: [
        {
          id: 'primary',
          playlist: currentEpisode.hls,
          type: 'hls',
          flags: [flags.CORS_ALLOWED],
          captions,
        },
      ],
    };
  },
  async scrapeMovie(ctx) {
    const playerData = await ctx.fetcher<string>(`index.php?imdb=${ctx.media.imdbId}`, {
      baseUrl: insertUnitBase,
    });
    ctx.progress(35);

    const streamRegex = /hls: "([^"]*)/;
    const streamData = streamRegex.exec(playerData);

    if (streamData === null || streamData[1] === null) {
      throw new NotFoundError('No result found');
    }
    ctx.progress(75);

    const subtitleRegex = /cc: (.*)/;
    const subtitleJSONData = subtitleRegex.exec(playerData);

    let captions: Caption[] = [];

    if (subtitleJSONData != null && subtitleJSONData[1] != null) {
      const subtitleData = JSON.parse(subtitleJSONData[1]);
      captions = await getCaptions(subtitleData);
    }

    ctx.progress(90);

    return {
      embeds: [],
      stream: [
        {
          id: 'primary',
          type: 'hls',
          playlist: streamData[1],
          flags: [flags.CORS_ALLOWED],
          captions,
        },
      ],
    };
  },
});
