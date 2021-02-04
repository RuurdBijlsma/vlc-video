# `<vlc-video>`

VLC player component for [vue-electron-builder](https://github.com/nklayman/vue-cli-plugin-electron-builder) projects (
might also work in other Vue/Electron projects). This component was made to work as similarly to `<video>` as possible,
when `controls` are enabled they will look similar to Chrome's `<video controls>`. 

Demo Electron app can be found here: https://github.com/RuurdBijlsma/vlc-video-demo

### Example usage in a Vue single file component:

```html

<template>
    <vlc-video height="300" width="auto" controls src="http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"/>
</template>

<script>
    import VlcVideo from "vlc-video";

    export default {
        components: {VlcVideo},
    }
</script>
```

### Screenshot of `<vlc-video controls>` and `<video controls>`

![f](https://github.com/ruurdbijlsma/vlc-video/blob/master/.gh/video-and-vlcvideo.png?raw=true)

## Extra features (That aren't in `<video>`)

* Any codec supported in VLC is supported in this player.
* Volume range is `[0,2]` with `2` being 200% volume, `1` is default 100% volume
* Custom props
    * `cover-poster` determines if the poster should cover the player or be contained within the player
    * `enable-keys` Enables key binds
    * `enable-scroll` Enables scroll to change volume
    * `enable-status` Enables status icons top right like VLC has (showing when volume changed, seek time,
      play/pause, etc.)
    * `enable-context-menu` Enables context menu allowing user control over video/audio/subtitle track, and some other
      VLC features
    * `dark` Enables dark theme (only applies to the context menu icons)

## Biggest differences with `<video>`

* Both `height` and `width` need to be specified, either by CSS or by HTML props. If you want height and/or width to be determined based on aspect ratio set that HTML property to `'auto'` like so: `<vlc-video height="auto" width="400">`
* For now only works on Windows x64 and Electron 11 as far as I know, this will probably be fixed in the future
* This is a Vue component, so some things will work differently, such as events, and programmatically setting certain
  props
* libvlc doesn't expose what sections of the video are buffered as far as I know, so the `.buffered` member returns that
  everything is buffered.
* `.canPlayType(mediaType)` always returns `'probably'`
* `srcObject` and `captureStream` are not supported
* Subtitles are handled by VLC, add a subtitles track by calling `.addTextTrack(filepath)` on the VlcVideo VueComponent.
  This file can be of any subtitles filetype that VLC supports.
* `picture-in-picture` is not supported
* Only `'nofullscreen'` of `.controlsList` is supported, this disables the fullscreen button when controls or context
  menu is enabled.

## Installation

1. For now VLC needs to be in PATH, in the future libvlc will probably be bundled
2. `npm install vlc-video`
3. Make sure `electron`, `vue`, and `RuurdBijlsma/wcjs-prebuilt` are installed alongside this (they are peer
   dependencies)
4. Make sure `nodeIntegration: true` and `externals: ['wcjs-prebuilt']` are specified in `vue.config.js` as shown below.

```js
module.exports = {
    pluginOptions: {
        electronBuilder: {
            externals: ['wcjs-prebuilt'],
            nodeIntegration: true,
        }
    },
}
```

4. When creating your browserWindow in Electron, in `webPreferences` enable remote modules:

```js
const win = new BrowserWindow({
    webPreferences: {
        enableRemoteModule: true,
        nodeIntegration: process.env.ELECTRON_NODE_INTEGRATION,
    }
})
```