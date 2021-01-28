<template>
    <div class="vlc-video"
         :style="mainStyle"
         @mousemove="moveOverPlayer"
         ref="player"
         @click.right="showContext"
         @keydown="handleKey"
         @wheel="handleScroll"
         tabindex="1">
        <div class="status-text" :style="{
            opacity: statusOpacity,
            transitionDuration: statusAnimationDuration,
        }" v-html="statusText"/>
        <loading-ring class="loading-ring" :style="{opacity: buffering ? 1 : 0}"/>
        <div class="canvas-center" :style="{
            backgroundImage: poster === '' ? 'none' : `url(${poster})`,
            backgroundSize: coverPoster ? 'cover' : 'contain',
        }">
            <canvas
                :style="{
                    width: canvasBounds.width + 'px',
                    height: canvasBounds.height + 'px',
                    opacity: poster === '' || firstPlayLoaded ? 1 : 0,
                }"
                class="canvas"
                ref="canvas"
            />
        </div>
        <controls v-if="controls"
                  @mouseenter.native="mouseOverControls=true" @mouseleave.native="mouseOverControls=false" @play="play"
                  @pause="pause" @seek="player.position = $event" @toggleFullscreen="toggleFullscreen"
                  @toggleMute="player.toggleMute()"
                  :mouse-over-controls="mouseOverControls" :current-time="currentTime" :duration="duration"
                  :muted="muted" :paused="paused" :bounds="bounds" :position="position"
                  :disable-fullscreen="controlsList.includes('nofullscreen')"
                  v-model="volume"
                  :style="{
                      opacity: hideControls && !mouseOverControls && !paused ? 0 : readyState < 2 ? 0.5 : 1,
                      pointerEvents: readyState < 2 ? 'none' : 'all',
                  }"/>
        <div class="media-information" v-if="showInformation" :style="{
            backgroundColor: dark ? '#333333ee' : '#aaaaaaee',
            color: dark ? '#aaaaaaee': '#333333ee',
        }">
            <div class="toolbar">
                <div class="close" @click="showInformation=false">x</div>
            </div>
            <div class="content" v-html="informationContent"/>
        </div>
    </div>
</template>

<script>
// TODO
// Add more os and electron support to wcjs-prebuilt
// Make wcjs-prebuilt an NPM package
// Maybe refactor code, make this less of a huge file
// dont fire scroll event on media information
// figure out audio device switching
// try to get css height and width working
// node-pre-gyp for WebChimera
// Chromecast support? lmao nee
// make into non-vue component

import {chimera, enums} from 'wrap-chimera'
import contextMenu from "electron-context-menu";
import LoadingRing from "./LoadingRing";
import Controls from "./Controls";
import Utils from "./utils";


export default {
    name: "VlcVideo",
    components: {Controls, LoadingRing},
    props: {
        // ------- HTML Video properties -------- //
        autoplay: {
            type: Boolean,
            default: false,
        },
        controls: {
            type: Boolean,
            default: false,
        },
        src: {
            type: String,
            default: '',
        },
        width: {
            type: [Number, String],
            default: 0,
        },
        height: {
            type: [Number, String],
            default: 0,
        },
        poster: {
            type: String,
            default: '',
        },
        loop: {
            type: Boolean,
            default: false,
        },
        // ---------- Miscellaneous -------- //
        hideBuffering: {
            type: Boolean,
            default: false,
        },
        coverPoster: {
            type: Boolean,
            default: false,
        },
        dark: {
            type: Boolean,
            default: false,
        },
        enableStatus: {
            type: Boolean,
            default: false,
        },
        enableContextMenu: {
            type: Boolean,
            default: false,
        },
        enableScroll: {
            type: Boolean,
            default: false,
        },
        enableKeys: {
            type: Boolean,
            default: false,
        },
    },
    data: () => ({
        computedBounds: {width: 0, height: 0},
        player: null,
        interval: null,
        disposeContextMenu: null,
        showContextMenu: false,
        showInformation: false,
        buffering: false,
        preventStatusUpdate: false,
        informationContent: '',
        statusText: '',
        statusAnimationDuration: '0s',
        statusOpacity: 0,
        statusTimeout: -1,
        volumeInput: 1,
        dontWatchTime: false,
        moveTimeout: -1,
        showBufferTimeout: -1,
        hideControls: false,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        mouseOverControls: false,
        icons: {},
        firstPlayLoaded: false,
        resizeInterval: -1,
        // Video element properties //
        defaultPlaybackRate: 1,
        playbackRate: 1,
        duration: NaN,
        videoWidth: 0,
        videoHeight: 0,
        readyState: HTMLMediaElement.HAVE_NOTHING,
        volume: 1,
        muted: false,
        paused: true,
        currentTime: 0,
        controlsList: [],
        crossOrigin: '',
        defaultMuted: false,
        ended: false,
        error: null,
        networkState: HTMLMediaElement.NETWORK_EMPTY,
        seeking: false,
        srcObject: null,
    }),
    beforeDestroy() {
        clearInterval(this.interval);
        clearInterval(this.resizeInterval);
        clearTimeout(this.statusTimeout);
        clearTimeout(this.moveTimeout);
        clearTimeout(this.showBufferTimeout);
        this.player?.destroy?.();
        this.disposeContextMenu?.();
        window.removeEventListener('resize', this.windowResize);
        document.removeEventListener('fullscreenchange', this.changeFullscreen);
    },
    async mounted() {
        let icons = ['pause', 'play_arrow', 'stop', 'volume_up', 'volume_down', 'volume_off', 'volume_off', 'info', 'info'];
        Promise.all(icons.map(Utils.nativeIcon))
            .then(result => {
                result.forEach((icon, i) => this.icons[icons[i]] = icon);
            });

        this.init();

        this.interval = setInterval(() => {
            if (this.player.state === 'buffering')
                this.showBuffering();
        }, 1000 / 50);
        this.resizeInterval = setInterval(() => {
            this.windowResize();
        }, 1000 / 20);

        this.moveTimeout = setTimeout(() => {
            this.hideControls = true;
        }, 1000);

        this.windowResize();
        window.addEventListener('resize', this.windowResize, false);
        document.addEventListener('fullscreenchange', this.changeFullscreen, false);
        this.disposeContextMenu = this.createContextMenu();
    },
    methods: {
        init() {
            let firstPlay = true, firstPause = true;
            this.player = chimera.createPlayer();
            this.player.bindCanvas(this.$refs.canvas);

            this.player.on('play', () => {
                this.paused = false;
                if (firstPlay) {
                    firstPlay = false;
                } else {
                    this.$emit('play');
                }
                this.showStatusText('▶')
            });
            this.player.on('pause', () => {
                this.paused = true;
                if (firstPause) {
                    firstPause = false;
                } else {
                    this.$emit('pause');
                }
                this.showStatusText('⏸')
            });
            this.player.on('stop', () => {
                this.paused = true;
                this.showStatusText('⏹')
            });
            this.player.on('mute', () => {
                this.muted = true;
                this.showStatusText('🔇')
            });
            this.player.on('unmute', () => {
                this.muted = false;
                this.showStatusText(`🔊 ${Math.round(this.player.volume)}%`)
            });
            this.player.on('volumeChange', v => {
                this.volume = v / 100;
                this.$emit('volumechange', v / 100);
                this.showStatusText(`${this.player.mute ? '🔇' : '🔊'} ${Math.round(v)}%`)
            });
            this.player.input.on('rateChange', v => {
                this.playbackRate = v;
                this.$emit('ratechange', v);
                this.showStatusText(`🐢 ${v.toFixed(2)}x`)
            });
            this.player.on('seek', () => {
                this.$emit('seeking');
                this.$emit('seeked');
                this.showStatusText(`${this.msToTime(this.player.time)} / ${this.msToTime(this.player.duration)}`)
            });
            this.player.on('load', () => {
                this.videoResize();

                this.readyState = HTMLMediaElement.HAVE_CURRENT_DATA;
                this.duration = this.player.duration / 1000;

                this.$emit('loadedmetadata');
                this.$emit('loadeddata');
            });
            this.player.on('time', () => {
                this.dontWatchTime = true;
                this.currentTime = this.player.time / 1000
                this.$emit('timeupdate', this.currentTime);
            });
            this.player.on('ended', () => {
                if (this.loop) {
                    this.currentTime = 0;
                    this.player.once('stop', () => {
                        this.player.play();
                        this.player.once('pause', this.player.play);
                    });
                } else {
                    this.$emit('ended');
                    this.ended = true;
                }
            });

            this.player.on('durationChange', duration => {
                this.$emit('durationchange', duration / 1000);
                this.duration = duration / 1000;
            });

            this.player.on('error', err => {
                this.error = 'VLC error' + err;
                this.$emit('stalled');
                this.$emit('error', ['VLC error', err]);
            });

            this.player.on('mediaChange', () => {
                firstPlay = true;
                firstPause = true;
                let onStateChange = newState => {
                    if (newState === 'play' || newState === 'pause') {
                        this.player.off('stateChange', onStateChange);
                        this.readyState = HTMLMediaElement.HAVE_FUTURE_DATA;
                        this.$emit('canplay');
                        this.readyState = HTMLMediaElement.HAVE_ENOUGH_DATA;
                        this.$emit('canplaythrough');
                        this.networkState = HTMLMediaElement.NETWORK_IDLE;
                    }
                }
                this.player.once('frameReady', () => {
                    if (!this.autoplay) {
                        this.player.mute = this.defaultMuted;
                        this.player.pause();
                        this.player.once('pause', () => this.preventStatusUpdate = false);
                    }
                });
                this.player.on('stateChange', onStateChange);
            });

            let prevState = this.player.state;
            this.player.on('stateChange', newState => {
                if (prevState === 'buffering' && newState === 'play') {
                    this.$emit('playing');
                }
                prevState = newState;
                if (newState === 'buffering')
                    this.showBuffering();
            });

            this.loadSrc();
        },
        showBuffering() {
            this.$emit('waiting');
            if (this.hideBuffering) return;
            clearTimeout(this.showBufferTimeout);

            this.buffering = true;
            this.showBufferTimeout = setTimeout(() => {
                this.buffering = false;
            }, 300);
        },
        changeFullscreen() {
            this.fullscreen = document.fullscreenElement === this.$refs.player;
            this.windowResize();
            this.$nextTick(() => this.windowResize());
        },
        moveOverPlayer(e) {
            if (e.movementX > 0 || e.movementY > 0) {
                this.hideControls = false;
                clearTimeout(this.moveTimeout);
                this.moveTimeout = setTimeout(() => {
                    this.hideControls = true;
                }, 1000);
            }
        },
        msToTime(ms, keepMs = false) {
            return Utils.msToTime(ms, keepMs);
        },
        showContext() {
            if (!this.enableContextMenu)
                return;
            this.showContextMenu = true;
            setTimeout(() => this.showContextMenu = false, 10);
        },
        createContextMenu() {
            return contextMenu({
                prepend: () => [
                    {
                        label: 'Pause',
                        accelerator: 'Space',
                        icon: this.icons['pause'],
                        visible: this.showContextMenu && this.player.playing,
                        click: () => {
                            this.player.pause();
                        }
                    },
                    {
                        label: 'Play',
                        accelerator: 'Space',
                        icon: this.icons['play_arrow'],
                        visible: this.showContextMenu && !this.player.playing,
                        click: () => {
                            if (this.src !== '')
                                this.player.play();
                        }
                    },
                    {
                        label: 'Stop',
                        accelerator: 'MediaStop',
                        icon: this.icons['stop'],
                        visible: this.showContextMenu && this.player.state !== 'Stopped',
                        click: () => {
                            this.player.stop();
                        }
                    },
                ],
                append: () => [
                    {
                        label: 'Audio',
                        visible: this.showContextMenu && this.player.input.hasVout,
                        enabled: this.player.input.hasVout,
                        submenu: [
                            {
                                label: 'Audio Track',
                                enabled: this.player.audio.tracks.length > 1,
                                submenu: this.player.audio.tracks.map((track, i) => ({
                                    label: track,
                                    type: 'radio',
                                    checked: i === this.player.audio.track,
                                    click: () => this.player.audio.track = i,
                                })),
                            },
                            // {
                            //     label: 'Audio Device',
                            //     submenu: [
                            //         {
                            //             type: 'radio',
                            //             label: 'test',
                            //         },
                            //     ],
                            // },
                            {
                                label: 'Stereo Mode',
                                submenu: enums.Channel.map((channel, i) => ({
                                    label: channel ?? `Channel ${i}`,
                                    type: 'radio',
                                    checked: channel === this.player.audio.channel,
                                    click: () => this.player.audio.channel = channel,
                                })),
                            },
                            {
                                label: 'Increase volume',
                                accelerator: '=',
                                icon: this.icons['volume_up'],
                                visible: this.showContextMenu,
                                enabled: this.player.volume < 200,
                                click: () => this.player.volume += 10
                            },
                            {
                                label: 'Decrease volume',
                                accelerator: '-',
                                icon: this.icons['volume_down'],
                                visible: this.showContextMenu,
                                enabled: this.player.volume > 0,
                                click: () => this.player.volume -= 10
                            },
                            {
                                label: 'Mute',
                                accelerator: 'm',
                                icon: this.icons['volume_off'],
                                visible: this.showContextMenu && !this.player.mute,
                                click: () => this.player.mute = true
                            },
                            {
                                label: 'Unmute',
                                accelerator: 'm',
                                icon: this.icons['volume_off'],
                                visible: this.showContextMenu && this.player.mute,
                                click: () => this.player.mute = false
                            },
                        ],
                    },
                    {
                        label: 'Video',
                        visible: this.showContextMenu && this.player.input.hasVout,
                        enabled: this.player.state !== 'Stopped',
                        submenu: [
                            {
                                label: 'Video Track',
                                enabled: this.player.video.tracks.length > 1,
                                submenu: this.player.video.tracks.map((track, i) => ({
                                    label: track.name,
                                    type: 'radio',
                                    checked: i === this.player.video.track,
                                    click: () => this.player.video.track = i,
                                })),
                            },
                            {
                                label: "Fullscreen",
                                type: 'checkbox',
                                enabled: !this.controlsList.includes('nofullscreen'),
                                checked: this.fullscreen,
                                click: () => this.toggleFullscreen(),
                            },
                            {
                                label: 'Deinterlace',
                                submenu: enums.DeinterlaceMode.map(mode => ({
                                    label: mode[0].toUpperCase() + mode.substr(1),
                                    type: 'radio',
                                    checked: mode === this.player.video.deinterlace.mode,
                                    click: () => this.player.video.deinterlace.mode = mode,
                                })),
                            },
                            // Doesn't seem to work
                            // {
                            //     label: 'Video Effects',
                            //     submenu: [
                            //         ['Contrast', [0, 2, 0.1]],
                            //         ['Brightness', [0, 2, 0.1]],
                            //         ['Hue', [0, 360, 5]],
                            //         ['Saturation', [0, 3, 0.15]],
                            //         ['Gamma', [0.01, 10, 0.1]]
                            //     ].flatMap(([name, [low, high, step]]) => ([{
                            //         label: `Increase ${name}`,
                            //         click: () => {
                            //             let key = name.toLowerCase();
                            //             this.player.video[key] = Math.min(this.player.video[key] + step, high);
                            //         }
                            //     }, {
                            //         label: `Decrease ${name}`,
                            //         click: () => {
                            //             let key = name.toLowerCase();
                            //             this.player.video[key] = Math.max(this.player.video[key] - step, low);
                            //         }
                            //     }])),
                            // },
                        ],
                    },
                    {
                        label: 'Subtitles',
                        visible: this.showContextMenu && this.player.input.hasVout,
                        enabled: this.player.state !== 'Stopped',
                        submenu: [
                            {
                                label: 'Sub Track',
                                enabled: this.player.subtitles.tracks.length > 0,
                                submenu: this.player.subtitles.tracks.map((track, i) => ({
                                    label: track,
                                    type: 'radio',
                                    checked: i === this.player.subtitles.track,
                                    click: () => this.player.subtitles.track = i,
                                })),
                            },
                            {
                                label: 'Add subtitles file...',
                                click: () => this.addSubtitles()
                            },
                        ],
                    },
                    {
                        label: 'Playback',
                        visible: this.showContextMenu && this.player.input.hasVout,
                        enabled: this.player.state !== 'Stopped',
                        submenu: [
                            {
                                label: 'Speed',
                                submenu: [
                                    ['2x', () => this.player.input.rate = 2],
                                    ['1.5x', () => this.player.input.rate = 1.5],
                                    ['1x', () => this.player.input.rate = 1],
                                    ['0.5x', () => this.player.input.rate = 0.5],
                                    ['0.2x', () => this.player.input.rate = 0.2],
                                ].map(([label, click]) => ({label, click}))
                            },
                            {
                                label: 'Jump forward (10s)',
                                accelerator: 'Right',
                                click: () => this.player.time = Math.min(this.player.time + 10000, this.player.duration),
                            },
                            {
                                label: 'Jump backwards (10s)',
                                accelerator: 'Left',
                                click: () => this.player.time = Math.max(this.player.time - 10000, 0),
                            },
                        ],
                    },
                    {
                        label: 'Information',
                        visible: this.showContextMenu && this.player.input.hasVout,
                        submenu: [
                            {
                                label: 'Media information',
                                icon: this.icons['info'],
                                click: () => {
                                    this.showInformation = true;
                                    let media = this.player.playlist.items[0];
                                    if (media === undefined)
                                        this.informationContent = 'No info';
                                    else {
                                        let text = '';
                                        let properties = ['title', 'mrl', 'duration', 'artist', 'genre', 'copyright', 'album', 'trackNumber',
                                            'description', 'rating', 'date', 'URL', 'language',
                                            'nowPlaying', 'publisher', 'encodedBy', 'artworkURL', 'trackID']
                                        for (let key of properties) {
                                            let value = media[key];
                                            if (key === 'duration')
                                                value = this.msToTime(value);
                                            text += `<div><b>${key}: </b>${value}</div>`;
                                        }
                                        this.informationContent = text;
                                    }
                                },
                            },
                            // No codec info available
                            // {
                            //     label: 'Codec information',
                            //     icon: this.icons['info'],
                            //     click: () => {
                            //         console.warn("not impolemented")
                            //     },
                            // },
                        ],
                    },
                ],
            });
        },
        handleScroll(e) {
            if (!this.enableScroll)
                return;
            this.player.volume -= e.deltaY / 20;
        },
        handleKey(e) {
            if (!this.enableKeys)
                return;
            switch (true) {
                case e.key === ' ':
                    this.player.togglePause();
                    break;
                case e.key === 'ArrowRight':
                    this.player.time += 10000;
                    break;
                case e.key === 'ArrowLeft':
                    this.player.time -= 10000;
                    break;
                case e.key === 'ArrowUp':
                    this.player.volume += 5;
                    break;
                case e.key === 'ArrowDown':
                    this.player.volume -= 5;
                    break;
                case e.key === '=':
                    let rateUp = this.player.input.rate * 1.25;
                    this.player.input.rate = rateUp > 0.5 ? Math.round(rateUp * 4) / 4 : rateUp;
                    break;
                case e.key === '-':
                    let rateDown = this.player.input.rate / 1.25;
                    this.player.input.rate = rateDown > 0.5 ? Math.round(rateDown * 4) / 4 : rateDown;
                    break;
                case e.key === 'm':
                    this.player.mute = !this.player.mute;
                    break;
            }
        },
        async addSubtitles() {
            let {filePath, canceled} = await this.promptSubtitleFile();
            if (!canceled) {
                this.player.subtitles.load(filePath);
            }
        },
        async promptSubtitleFile() {
            let {dialog} = require('electron').remote
            let {canceled, filePaths} = await dialog.showOpenDialog({
                title: "Add subtitles from file",
                buttonLabel: "Add subtitles",
                filters: [{
                    name: "Subtitle files",
                    extensions: ['cdg', 'idx', 'srt', 'sub', 'utf',
                        'ass', 'ssa', 'aqt', 'jss', 'psb', 'rt',
                        'sami', 'smi', 'txt', 'smil', 'stl', 'usf', 'dks',
                        'pjs', 'mpl2', 'mks', 'vtt', 'tt', 'ttml', 'dfxp', 'scc']
                }, {
                    name: "All files",
                    extensions: ['*']
                }],
                properties: ['openFile']
            })
            return {canceled, filePath: filePaths[0]};
        },
        showStatusText(text, timeout = 2000) {
            if (!this.enableStatus || this.preventStatusUpdate)
                return;
            clearTimeout(this.statusTimeout);
            this.statusAnimationDuration = '0.1s';
            this.statusOpacity = 1;
            this.statusText = text;
            this.statusTimeout = setTimeout(() => {
                this.statusOpacity = 0;
                this.statusAnimationDuration = '0.4s';
            }, timeout);
        },
        loadSrc() {
            this.player.stop();

            this.preventStatusUpdate = true;
            this.duration = NaN;
            this.ended = false;
            this.readyState = HTMLMediaElement.HAVE_NOTHING;
            this.networkState = HTMLMediaElement.NETWORK_LOADING;
            this.videoWidth = 0;
            this.videoHeight = 0;
            this.currentTime = 0;
            this.error = null;
            this.firstPlayLoaded = false;

            if (this.src === '') {
                this.networkState = HTMLMediaElement.NETWORK_NO_SOURCE;
            }

            this.player.playUrl(this.src);
            this.$on('play', () => {
                this.firstPlayLoaded = true
            });
            this.$emit('loadstart');
        },
        videoResize() {
            this.videoWidth = this.player.video.width;
            this.videoHeight = this.player.video.height;
        },
        windowResize() {
            this.windowWidth = window.innerWidth;
            this.windowHeight = window.innerHeight;
            let container = this.$refs.player;
            this.computedBounds = {
                width: container.offsetWidth,
                height: container.offsetHeight,
                left: container.offsetLeft,
                top: container.offsetTop,
            };
        },
        toggleFullscreen() {
            if (this.fullscreen) {
                document.exitFullscreen();
            } else {
                let container = this.$refs.player;
                container.requestFullscreen();
            }
        },
        // ------------ HTMLVideoElement methods ---------- //
        addTextTrack(filePath) {
            this.player.subtitles.load(filePath);
        },
        captureStream() {
            console.warn("Not implemented");
        },
        canPlayType() {
            return 'probably';
        },
        fastSeek(t) {
            this.player.time = t * 1000;
        },
        load() {
            // todo this doesnt work well
            if (this.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
                this.$emit('abort');
            } else {
                this.$emit('emptied');
            }
            this.player.destroy();
            this.init();
        },
        async play() {
            if (this.src === '')
                return;
            this.player.play();
            if (this.player.state === 'Playing')
                return;
            return new Promise((resolve) => this.player.once('play', resolve));
        },
        pause() {
            this.player.pause();
        },
        seekToNextFrame(n = 1) {
            this.player.time += (1000 * n) / this.player.input.fps;
        },
    },
    computed: {
        mainStyle() {
            let style = {
                '--width': `${this.bounds.width}px`,
                '--height': `${this.bounds.height}px`,
                cursor: this.hideControls && !this.mouseOverControls && !this.paused ? 'none' : 'auto',
            }
            if (this.height === 'auto')
                style.height = this.bounds.height + 'px';
            if (this.height !== 0)
                style.height = this.bounds.height + 'px';
            if (this.width === 'auto')
                style.width = this.bounds.width + 'px';
            if (this.width !== 0)
                style.width = this.bounds.width + 'px';
            return style;
        },
        bounds() {
            return {
                ...this.computedBounds,
                width: this.width === 'auto' ? this.canvasBounds.width :
                    this.width !== 0 ? +this.width :
                        Math.max(this.computedBounds.width, this.canvasBounds.width),
                height: this.height === 'auto' ? this.canvasBounds.height :
                    this.height !== 0 ? +this.height :
                        Math.max(this.computedBounds.height, this.canvasBounds.height),
            };
        },
        canvasBounds() {
            let width, height;
            if (this.height === 'auto' && this.width === 'auto') {
                return {width: this.videoWidth, height: this.videoHeight};
            } else if (this.height === 'auto') {
                width = this.computedBounds.width;
                height = width / this.aspectRatio;
            } else if (this.width === 'auto') {
                height = this.computedBounds.height;
                width = height * this.aspectRatio;
            } else {
                let containerRatio = this.computedBounds.width / this.computedBounds.height;
                if (this.aspectRatio > containerRatio) {
                    width = this.computedBounds.width;
                    height = width / this.aspectRatio;
                } else {
                    height = this.computedBounds.height;
                    width = height * this.aspectRatio;
                }
            }
            return {width, height};
        },
        // ------------ HTMLVideoElement getters ---------- //
        currentSrc() {
            return this.src;
        },
        audioTracks: {
            cache: false,
            get() {
                let audio = this.player.audio;
                return audio.tracks.slice(1).map((track, i) => ({
                    get enabled() {
                        return audio.track === i + 1
                    },
                    set enabled(v) {
                        if (v) audio.track = i + 1
                        else if (audio.track === i + 1) audio.track = 0
                    },
                    id: i,
                    kind: i === 0 ? 'main' : 'alternative',
                    label: track,
                    language: '',
                    sourceBuffer: null,
                }))
            },
        },
        textTracks: {
            cache: false,
            get() {
                let subtitles = this.player.subtitles;
                return subtitles.tracks.slice(1).map((track, i) => ({
                    get enabled() {
                        return subtitles.track === i + 1
                    },
                    set enabled(v) {
                        if (v) subtitles.track = i + 1
                        else if (subtitles.track === i + 1) subtitles.track = 0
                    },
                    id: i,
                    kind: i === 0 ? 'main' : 'alternative',
                    label: track,
                    language: '',
                    sourceBuffer: null,
                }))
            },
        },
        videoTracks: {
            cache: false,
            get() {
                let video = this.player.video;
                return video.tracks.slice(1).map((track, i) => ({
                    get selected() {
                        return video.track === i + 1
                    },
                    set selected(v) {
                        if (v) video.track = i + 1
                        else if (video.track === i + 1) video.track = 0
                    },
                    id: i,
                    kind: i === 0 ? 'main' : 'alternative',
                    label: track.name,
                    size: {
                        width: track.width,
                        height: track.height,
                    },
                    language: '',
                    sourceBuffer: null,
                }))
            },
        },
        buffered: {
            cache: false,
            get() {
                return {
                    length: 1, start: () => {
                        return 0
                    }, end: () => {
                        return this.duration
                    }
                };
            },
        },
        seekable() {
            return this.readyState > 0;
        },
        // ---------------- Miscellaneous ----------------- //
        position() {
            if (this.duration && this.duration !== 0)
                return this.currentTime / this.duration;
            return 0;
        },
        aspectRatio() {
            return (this.videoWidth !== 0 && this.videoHeight !== 0) ? this.videoWidth / this.videoHeight : 16 / 9;
        },
        userWidth() {
            return this.width === 0 ? undefined : +this.width;
        },
        userHeight() {
            return this.height === 0 ? undefined : +this.height;
        },
    },
    watch: {
        currentTime(newValue, oldValue) {
            if (newValue !== oldValue && !this.dontWatchTime)
                this.player.time = this.currentTime * 1000;
            else if (this.dontWatchTime)
                this.dontWatchTime = false;
        },
        playbackRate(newValue, oldValue) {
            if (newValue !== oldValue)
                this.player.input.rate = this.playbackRate;
        },
        volume(newValue, oldValue) {
            if (newValue !== oldValue)
                this.player.volume = this.volume * 100;
        },
        width() {
            this.$nextTick(() => this.windowResize());
        },
        height() {
            this.$nextTick(() => this.windowResize());
        },
        videoWidth() {
            this.$nextTick(() => this.windowResize());
        },
        videoHeight() {
            this.$nextTick(() => this.windowResize());
        },
        src() {
            this.loadSrc()
        },
    },
}
</script>

<style scoped>
.vlc-video {
    display: inline-block;
    --width: 100px;
    --height: 50px;
    position: relative;
}

.vlc-video:focus {
    outline: none;
}

.canvas-center {
    background-size: contain;
    background-position: center;
    background-repeat: no-repeat;
    width: 100%;
    height: 100%;
    display: flex;
    place-items: center;
    justify-content: center;
    z-index: 1;
    pointer-events: none;
    position: absolute;
    top: 0;
    left: 0;
}

.canvas {
    float: left;
    max-width: var(--width);
    max-height: var(--height);
    background-color: #292929;
}

.status-text {
    font-family: "Segoe UI Symbol", Symbol, sans-serif;
    font-size: calc(var(--width) / 18);
    text-align: right;
    color: white;
    text-shadow: 0 0 calc(var(--width) / 100) black;
    position: absolute;
    top: 10%;
    right: 10%;
    z-index: 3;
}

.loading-ring {
    position: absolute;
    top: 10%;
    left: 10%;
    z-index: 3;
}

.media-information {
    width: calc(var(--width) - 10%);
    max-height: calc(var(--height) - 10%);
    position: absolute;
    top: 5%;
    left: 5%;
    z-index: 3;
}

.toolbar {
    width: 100%;
    height: 30px;
    background-color: rgba(128, 128, 128, 0.2);
    display: flex;
    justify-content: flex-end;
}

.close {
    margin: 3px;
    width: 24px;
    height: 24px;
    line-height: 24px;
    text-align: center;
    vertical-align: middle;
    cursor: pointer;
    border-radius: 50%;
    box-shadow: inset 0 0 0 2px rgba(128, 128, 128, 0.5);
    transition: background-color 0.15s;
    user-select: none;
}

.close:hover {
    background-color: rgba(128, 128, 128, 0.3);
}

.content {
    padding: 20px;
    text-align: left;
    overflow-y: auto;
    max-height: calc(var(--height) - 110px);
}

.content >>> div {
    margin: 5px 0;
}

.content >>> div > b {
    user-select: none;
}
</style>