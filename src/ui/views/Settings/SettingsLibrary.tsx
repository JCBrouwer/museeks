import * as electron from 'electron';
import * as React from 'react';

import * as Setting from '../../components/Setting/Setting';
import Dropzone from '../../components/SettingDropzone/SettingDropzone';
import CheckboxSetting from '../../components/SettingCheckbox/SettingCheckbox';

import * as LibraryActions from '../../actions/LibraryActions';
import * as PlayerActions from '../../actions/PlayerActions';
import { LibraryState } from '../../reducers/library';
import Button from '../../elements/Button/Button';

const { dialog } = electron.remote;

interface Props {
  library: LibraryState;
}

interface State {
  importDateAdded: boolean,
  importPlayCount: boolean,
  importRatings: boolean,
  iTunesXMLFile: string | null
}

export default class SettingsLibrary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      importDateAdded: true,
      importPlayCount: true,
      importRatings: true,
      iTunesXMLFile: null
    };
  }

  onDrop(e: DragEvent) {
    const files = [];

    if (e.dataTransfer) {
      const eventFiles = e.dataTransfer.files;

      for (let i = 0; i < eventFiles.length; i++) {
        files.push(eventFiles[i].path);
      }

      LibraryActions.add(files).catch((err) => {
        console.warn(err);
      });
    }
  }

  async resetLibrary() {
    PlayerActions.stop();
    await LibraryActions.reset();
  }

  async openFolderSelector() {
    const result = await dialog.showOpenDialog({
      properties: ['multiSelections', 'openDirectory', 'openFile']
    });

    if (result.filePaths) {
      LibraryActions.add(result.filePaths).catch((err) => {
        console.warn(err);
      });
    }
  }

  async selectiTunesXMLFile() {
    const result = await dialog.showOpenDialog({
      properties: ['openFile']
    });
    this.setState({iTunesXMLFile: result.filePaths[0]})
  }

  render() {
    return (
      <div className='setting settings-musicfolder'>
        <Setting.Section>
          <h3 style={{ marginTop: 0 }}>Import music</h3>
          <Dropzone
            title='Add music to the library'
            subtitle='Drop files or folders here'
            onDrop={this.onDrop}
            onClick={this.openFolderSelector}
          />
          <Setting.Description>
            This will also scan for <code>.m3u</code> files and create corresponding playlists.
          </Setting.Description>
        </Setting.Section>
        <Setting.Section>
          <h3>Import from iTunes</h3>
          <CheckboxSetting
            slug='import-date-added'
            title='Import date added'
            description='Import date added from iTunes library'
            defaultValue={true}
            onClick={() => this.setState({importDateAdded: !this.state.importDateAdded})}
          />
          <CheckboxSetting
            slug='import-rating'
            title='Import ratings'
            description='Import track ratings from iTunes library'
            defaultValue={true}
            onClick={() => this.setState({importRatings: !this.state.importRatings})}
          />
          <CheckboxSetting
            slug='import-play-count'
            title='Import play count'
            description='Import play count from iTunes library'
            defaultValue={true}
            onClick={() => this.setState({importPlayCount: !this.state.importPlayCount})}
          />
          <Button
            onClick={async () => {
              this.selectiTunesXMLFile();
              if (this.state.iTunesXMLFile == null) return
              await LibraryActions.scaniTunesAttributes(
                this.state.iTunesXMLFile,
                this.state.importDateAdded,
                this.state.importRatings,
                this.state.importPlayCount
              );
            }}
          >
            Import from iTunes
          </Button>
          <Setting.Description>
            This will scan an iTunes Library.xml file for the attributes checked above and import them.
          </Setting.Description>
        </Setting.Section>
        <Setting.Section>
          <h3>Import date created</h3>
          <Button
            onClick={async () => {
              await LibraryActions.scanDateCreated();
            }}
          >
            Import from file creation date
          </Button>
          <Setting.Description>
            This will scan each file for the date it was created and set it's date added attribute to that date.
          </Setting.Description>
        </Setting.Section>
        <Setting.Section>
          <h3>Danger zone</h3>
          <Button
            relevancy='danger'
            title='Fully reset the library'
            disabled={this.props.library.refreshing}
            onClick={this.resetLibrary}
          >
            Reset library
          </Button>
        </Setting.Section>
      </div>
    );
  }
}
