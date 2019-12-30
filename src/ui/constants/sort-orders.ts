import { Track, SortOrder, SortBy } from '../../shared/types/interfaces';

// For perforances reasons, otherwise _.orderBy will perform weird check
// the is far more resource/time impactful
const parseArtist = (t: Track): string => t.loweredMetas.artist.toString();
const parseGenre = (t: Track): string => t.loweredMetas.genre.toString();

// Declarations
const sortOrders = {
  [SortBy.DATEADDED]: {
    [SortOrder.DSC]: [
      // Default
      ['dateAdded', parseArtist, 'year', 'loweredMetas.album', 'disk.no', 'track.no'],
      ['desc']
    ],
    [SortOrder.ASC]: [['dateAdded', parseArtist, 'year', 'loweredMetas.album', 'disk.no', 'track.no'], null]
  },
  [SortBy.ARTIST]: {
    [SortOrder.ASC]: [[parseArtist, 'year', 'loweredMetas.album', 'disk.no', 'track.no'], null],
    [SortOrder.DSC]: [[parseArtist, 'year', 'loweredMetas.album', 'disk.no', 'track.no'], ['desc']]
  },
  [SortBy.TITLE]: {
    [SortOrder.ASC]: [['loweredMetas.title', parseArtist, 'year', 'loweredMetas.album', 'disk.no', 'track.no'], null],
    [SortOrder.DSC]: [['loweredMetas.title', parseArtist, 'year', 'loweredMetas.album', 'disk.no', 'track.no'], ['desc']]
  },
  [SortBy.DURATION]: {
    [SortOrder.ASC]: [['duration', parseArtist, 'year', 'loweredMetas.album', 'disk.no', 'track.no'], null],
    [SortOrder.DSC]: [['duration', parseArtist, 'year', 'loweredMetas.album', 'disk.no', 'track.no'], ['desc']]
  },
  [SortBy.ALBUM]: {
    [SortOrder.ASC]: [['loweredMetas.album', parseArtist, 'year', 'disk.no', 'track.no'], null],
    [SortOrder.DSC]: [['loweredMetas.album', parseArtist, 'year', 'disk.no', 'track.no'], ['desc']]
  },
  [SortBy.GENRE]: {
    [SortOrder.ASC]: [[parseGenre, parseArtist, 'year', 'loweredMetas.album', 'disk.no', 'track.no'], null],
    [SortOrder.DSC]: [[parseGenre, parseArtist, 'year', 'loweredMetas.album', 'disk.no', 'track.no'], ['desc']]
  },
  [SortBy.RATING]: {
    [SortOrder.ASC]: [['rating', parseArtist, 'year', 'loweredMetas.album', 'disk.no', 'track.no'], null],
    [SortOrder.DSC]: [['rating', parseArtist, 'year', 'loweredMetas.album', 'disk.no', 'track.no'], ['desc']]
  }
};

export default sortOrders;
