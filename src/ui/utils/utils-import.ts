import * as path from 'path'
import * as fs from 'fs'
// @ts-ignore
import * as byline from 'byline'
import unescape from 'lodash-es/unescape';

export interface iTrack {
  title: string;
  artist: string;
  dateadded: Date;
  rating: number;
  playcount: number;
}

/**
 * Creates an stream of JSON tracks from an iTunes Library XML file.
 *
 * @param  String
 * @return List of tracks in iTunes library
 */
export function getItunesTracks(xmlfile: string): Promise<iTrack[]> {
  return new Promise((resolve, reject) => {
    let libraryPath: fs.PathLike = xmlfile;
  	let track: iTrack = {title: "", artist: "", dateadded: new Date(), rating: 0, playcount: 0};
    let tracks: iTrack[] = [];
    let playlistID: string | null = null;
    let trackKind: string = "";
  	let line: string;
  	let trackCount: number = 0;

  	if (path.extname(libraryPath) != '.xml') throw Error("File provided is not XML!");
  	let xmlStream: byline.LineStream = byline.createStream(fs.createReadStream(libraryPath));

    xmlStream.on('error', () => { reject("Error parsing tracks in iTunes XML") });

    xmlStream.on('finish', () => {
      if (trackCount == 0) reject('0 tracks parsed')
      resolve(tracks);
    });

    xmlStream.on('readable', () => {
    	while (null !== (line = xmlStream.read())) {
        if (line.indexOf("<dict>") > -1) {
  				// initialize track
  				track = {title: "", artist: "", dateadded: new Date(), rating: 0, playcount: 0};
  			} else if (line.indexOf("<key>") > -1) {
  				// extract information from track dict
        	let key = String(line).match("<key>(.*)</key>");
        	let value = String(line).match("<integer>(.*)</integer>");
        	if (!value) value = String(line).match("<date>(.*)</date>");
        	if (!value) value = String(line).match("<string>(.*)</string>");
          if (!value || !key) continue;

          // 0th entry has e.g. <key> ... </key> wrapped around, 1st has just the ... we're interested in
          let k: String = key![1];
        	let v = value![1];

          switch (k) {
            case "Playlist ID": playlistID = v; break;
            case "Kind": trackKind = v; break;
            case "Name": track.title = unescape(v); break;
            case "Artist": track.artist = unescape(v); break;
            case "Date Added": track.dateadded = new Date(v); break;
            case "Rating": track.rating = parseInt(v); break;
            case "Play Count": track.playcount = parseInt(v); break;
          }
  			} else if (line.indexOf("</dict>") > -1) {
  				// finish track
  				if ((track.title || track.artist) && !playlistID && (trackKind.indexOf("audio file") > -1)) {
  					trackCount++;;
  					tracks.push(track);
  				}
          playlistID = null;
          trackKind = "";
  			}
    	}
    });
  });
}
