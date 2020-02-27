import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import * as electron from 'electron';
import * as globby from 'globby';
import * as queue from 'queue';

import store from '../store';

import types from '../constants/action-types';

import * as app from '../lib/app';
import * as utils from '../utils/utils';
import * as m3u from '../utils/utils-m3u';
import { iTrack, getItunesTracks } from '../utils/utils-import'

import { SortBy, TrackModel } from '../../shared/types/interfaces';
import { SUPPORTED_PLAYLISTS_EXTENSIONS, SUPPORTED_TRACKS_EXTENSIONS } from '../../shared/constants';
import * as PlaylistsActions from './PlaylistsActions';
import * as ToastsActions from './ToastsActions';

const { dialog } = electron.remote;
const stat = util.promisify(fs.stat);

interface ScanFile {
  path: string;
  stat: fs.Stats;
}

/**
 * Load tracks from database
 */
export const refresh = async () => {
  try {
    const tracks = await app.models.Track.find().execAsync();

    store.dispatch({
      type: types.LIBRARY_REFRESH,
      payload: {
        tracks
      }
    });
  } catch (err) {
    console.warn(err);
  }
};

/**
 * Filter tracks by search
 */
export const search = (value: string) => {
  store.dispatch({
    type: types.FILTER_SEARCH,
    payload: {
      search: value
    }
  });
};

/**
 * Filter tracks by sort query
 */
export const sort = (sortBy: SortBy) => {
  store.dispatch({
    type: types.LIBRARY_SORT,
    payload: {
      sortBy
    }
  });
};

const scanPlaylists = async (paths: string[]) => {
  return Promise.all(
    paths.map(async (filePath) => {
      try {
        const playlistFiles = m3u.parse(filePath);
        const playlistName = path.parse(filePath).name;

        const existingTracks: TrackModel[] = await app.models.Track.findAsync({
          $or: playlistFiles.map((filePath) => ({ path: filePath }))
        });

        await PlaylistsActions.create(
          playlistName,
          existingTracks.map((track) => track._id),
          filePath
        );
      } catch (err) {
        console.warn(err);
      }
    })
  );
};

const scan = {
  processed: 0,
  total: 0
};

const scanTracks = async (paths: string[]): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (paths.length === 0) resolve();

    try {
      // Instantiate queue
      let scannedFiles: TrackModel[] = [];

      // eslint-disable-next-line
      // @ts-ignore Outdated types
      // https://github.com/jessetane/queue/pull/15#issuecomment-414091539
      const scanQueue = queue();
      scanQueue.concurrency = 32;
      scanQueue.autostart = true;

      scanQueue.on('end', async () => {
        scan.processed = 0;
        scan.total = 0;

        resolve();
      });

      scanQueue.on('success', () => {
        // Every 10 scans, update progress bar
        if (scan.processed % 100 === 0) {
          // Progress bar update
          store.dispatch({
            type: types.LIBRARY_REFRESH_PROGRESS,
            payload: {
              processed: scan.processed,
              total: scan.total
            }
          });

          // Add tracks to the library view
          const tracks = [...scannedFiles];
          scannedFiles = []; // Reset current selection
          store.dispatch({
            type: types.LIBRARY_ADD_TRACKS,
            payload: {
              tracks
            }
          });

          // TODO progressive loading in the store, don't freeze the app, able to add files/folders when scanning
        }
      });
      // End queue instantiation

      scan.total += paths.length;

      paths.forEach((filePath) => {
        scanQueue.push(async (callback: Function) => {
          try {
            // Check if there is an existing record in the DB
            const existingDoc = await app.models.Track.findOneAsync({ path: filePath });

            // If there is existing document
            if (!existingDoc) {
              // Get metadata
              const track = await utils.getMetadata(filePath);
              const insertedDoc: TrackModel = await app.models.Track.insertAsync(track);
              scannedFiles.push(insertedDoc);
            }

            scan.processed++;
          } catch (err) {
            console.warn(err);
          }

          callback();
        });
      });
    } catch (err) {
      console.warn(err);
      reject(err);
    }
  });
};

/**
 * Add tracks to Library
 */
export const add = async (pathsToScan: string[]) => {
  store.dispatch({
    type: types.LIBRARY_REFRESH_START
  });

  try {
    // 1. Get the stats for all the files/paths
    const statsPromises: Promise<ScanFile>[] = pathsToScan.map(async (folderPath) => ({
      path: folderPath,
      stat: await stat(folderPath)
    }));

    const paths = await Promise.all(statsPromises);

    // 2. Split directories and files
    const files: string[] = [];
    const folders: string[] = [];

    paths.forEach((elem) => {
      if (elem.stat.isFile()) files.push(elem.path);
      if (elem.stat.isDirectory() || elem.stat.isSymbolicLink()) folders.push(elem.path);
    });

    // 3. Scan all the directories with globby
    const globbies = folders.map((folder) => {
      const pattern = path.join(folder, '**/*.*');
      return globby(pattern, { followSymbolicLinks: true });
    });

    const subDirectoriesFiles = await Promise.all(globbies);
    // Scan folders and add files to library

    // 4. Merge all path arrays together and filter them with the extensions we support
    const allFiles = subDirectoriesFiles.reduce((acc, array) => acc.concat(array), [] as string[]).concat(files); // Add the initial files

    const supportedTrackFiles = allFiles.filter((filePath) => {
      const extension = path.extname(filePath).toLowerCase();
      return SUPPORTED_TRACKS_EXTENSIONS.includes(extension);
    });

    const supportedPlaylistsFiles = allFiles.filter((filePath) => {
      const extension = path.extname(filePath).toLowerCase();
      return SUPPORTED_PLAYLISTS_EXTENSIONS.includes(extension);
    });

    if (supportedTrackFiles.length === 0 && supportedPlaylistsFiles.length === 0) {
      store.dispatch({
        type: types.LIBRARY_REFRESH_END
      });

      return;
    }

    // 5. Scan tracks then scan playlists
    await scanTracks(supportedTrackFiles);
    await scanPlaylists(supportedPlaylistsFiles);

    await refresh();
    await PlaylistsActions.refresh();
  } catch (err) {
    ToastsActions.add('danger', 'An error occured when scanning the library');
    console.warn(err);
  }

  store.dispatch({
    type: types.LIBRARY_REFRESH_END
  });
};

/**
 * remove tracks from library
 */
export const remove = async (tracksIds: string[]) => {
  // not calling await on it as it calls the synchonous message box
  const result = await dialog.showMessageBox(app.browserWindows.main, {
    buttons: ['Cancel', 'Remove'],
    title: 'Remove tracks from library?',
    message: `Are you sure you want to remove ${tracksIds.length} element(s) from your library?`,
    type: 'warning'
  });

  if (result.response === 1) {
    // button possition, here 'remove'
    // Remove tracks from the Track collection
    app.models.Track.removeAsync({ _id: { $in: tracksIds } }, { multi: true });

    store.dispatch({
      type: types.LIBRARY_REMOVE_TRACKS,
      payload: {
        tracksIds
      }
    });
    // That would be great to remove those ids from all the playlists, but it's not easy
    // and should not cause strange behaviors, all PR for that would be really appreciated
    // TODO: see if it's possible to remove the Ids from the selected state of TracksList as it "could" lead to strange behaviors
  }
};

/**
 * Reset the library
 */
export const reset = async () => {
  try {
    const result = await dialog.showMessageBox(app.browserWindows.main, {
      buttons: ['Cancel', 'Reset'],
      title: 'Reset library?',
      message: 'Are you sure you want to reset your library? All your tracks and playlists will be cleared.',
      type: 'warning'
    });

    if (result.response === 1) {
      store.dispatch({
        type: types.LIBRARY_REFRESH_START
      });

      await app.models.Track.removeAsync({}, { multi: true });
      await app.models.Playlist.removeAsync({}, { multi: true });

      store.dispatch({
        type: types.LIBRARY_RESET
      });

      store.dispatch({
        type: types.LIBRARY_REFRESH_END
      });

      await refresh();
    }
  } catch (err) {
    console.error(err);
  }
};

/**
 * Update the play count attribute.
 */
export const incrementPlayCount = async (source: string) => {
  const query = { src: source }; // HACK Not great, should be done with an _id
  const update = { $inc: { playcount: 1 } };
  try {
    await app.models.Track.updateAsync(query, update);
  } catch (err) {
    console.warn(err);
  }
};

/**
 * Update the play count attribute.
 */
export const updatePlayCount = async (path: string, newCount: number) => {
  try {
    await app.models.Track.updateAsync({ path: path }, { $set: { playcount: newCount } });
  } catch (err) {
    console.warn(err);
  }
};

/**
 * Update the track rating attribute.
 */
export const updateTrackRating = async (path: string, rating: number) => {
  try {
    await app.models.Track.updateAsync({ path: path }, { $set: { rating: rating } });
  } catch (err) {
    console.warn(err);
  }
};

/**
 * Update date added attribute.
 */
export const updateDateAdded = async (path: string, dateAdded: Date) => {
  try {
    await app.models.Track.updateAsync({ path: path }, { $set: { dateAdded: dateAdded } });
  } catch (err) {
    console.warn(err);
  }
};

/**
 * Scan files for creation date and update their date added attribute
 */
export const scanDateCreated = async (): Promise<void> => {
  store.dispatch({type: types.LIBRARY_REFRESH_START});
  const tracks = await app.models.Track.find().execAsync()

  // eslint-disable-next-line
  // @ts-ignore Outdated types
  // https://github.com/jessetane/queue/pull/15#issuecomment-414091539
  const scanQueue = queue();
  scanQueue.concurrency = 32;
  scanQueue.autostart = true;

  scanQueue.on('end', async () => {
    scan.processed = 0;
    scan.total = 0;
    refresh()
    store.dispatch({ type: types.LIBRARY_REFRESH_END, payload: { tracks } });
  });

  scanQueue.on('success', () => {
    if (scan.processed % 100 === 0) // Every 100 scans, update progress bar
      store.dispatch({type: types.LIBRARY_REFRESH_PROGRESS, payload: {processed: scan.processed, total: scan.total}});
  });

  scan.total += tracks.length;
  var stats: fs.Stats;
  tracks.forEach((track: TrackModel) => {
    scanQueue.push(async (callback: Function) => {
      try {
        stats = await stat(track.path)
        updateDateAdded(track.path, new Date(Math.min(stats.mtime.getTime(), stats.birthtime.getTime())))
        scan.processed++;
      } catch (err) {
        console.warn("Error importing date added for ", track.artist[0], " - ", track.title, ". mtime: ", stats.mtime, " birthtime: ", stats.birthtime);
        console.warn(err);
      }
      callback();
    });
  });
};

const cleanse = (ar: string, ti: string): string => {
  const str = ar.toUpperCase().replace(/(FEAT\.|FT\.|FEATURING).*/, "") + ti.toUpperCase().replace(/(FEAT\.|FT\.|FEATURING).*/, "")
  return str.replace(/(\(|\[)ORIGINAL MIX(\)|\])|\.|\/|\\|\[|\]|\(|\)|\'|\"|\s/g, "")
}

/**
 * Scan an iTunes Library.xml for date added, rating, and play count
 */
export const scaniTunesAttributes = async (iTunesXMLFile: string, importDateAdded: boolean, importRatings: boolean, importPlayCount:boolean): Promise<void> => {
  store.dispatch({type: types.LIBRARY_REFRESH_START});

  // load tracks and sort by artist, tie break by track title
  const tracks = (await app.models.Track.find().execAsync()).sort((a: TrackModel, b: TrackModel) => {
    return cleanse(a.artist[0], a.title).localeCompare(cleanse(b.artist[0], b.title))
  });

  store.dispatch({type: types.LIBRARY_REFRESH_PROGRESS, payload: {processed: 1, total: 4}});

  var itracks = await getItunesTracks(iTunesXMLFile);

  store.dispatch({type: types.LIBRARY_REFRESH_PROGRESS, payload: {processed: 2, total: 4}});

  // sort by artist, tie break by track title
  itracks = itracks.sort((a: iTrack, b: iTrack) => {
    return cleanse(a.artist, a.title).localeCompare(cleanse(b.artist, b.title))
  });

  store.dispatch({type: types.LIBRARY_REFRESH_PROGRESS, payload: {processed: 3, total: 4}});

  // O(n) find intersection in sorted lists
  var t = 0, i = 0;
  while (t < tracks.length && i < itracks.length) {
    try {
      // console.log(cleanse(tracks[t].artist[0], tracks[t].title), cleanse(itracks[i].artist, itracks[i].title))
      if (cleanse(tracks[t].artist[0], tracks[t].title).localeCompare(cleanse(itracks[i].artist, itracks[i].title)) === 0) {
        if (importDateAdded) updateDateAdded(tracks[t].path, new Date(itracks[i].dateadded));
        if (importRatings) updateTrackRating(tracks[t].path, itracks[i].rating / 100 * 5);
        if (importPlayCount) updatePlayCount(tracks[t].path, itracks[i].playcount);
        t++;
      }
      else if (cleanse(tracks[t].artist[0], tracks[t].title).localeCompare(cleanse(itracks[i].artist, itracks[i].title)) > 0) i++;
      else t++;
      if ((t + i) % ((tracks.length + itracks.length) / 20 | 0) === 0)
        store.dispatch({type: types.LIBRARY_REFRESH_PROGRESS, payload: {processed: t + i, total: tracks.length + itracks.length}});
    } catch (err) {
      console.warn("Error importing ", tracks[t].artist[0], " - ", tracks[t].title, " from iTunes");
      console.warn(err);
    }
  }
  store.dispatch({ type: types.LIBRARY_REFRESH_END, payload: { tracks } });
  refresh()
};
