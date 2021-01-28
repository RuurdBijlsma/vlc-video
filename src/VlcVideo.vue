<template>
    <div class="vlc-video"
         :style="{
             '--width': `${containerBounds.width}px`,
             '--height': `${containerBounds.height}px`,
             cursor: hideControls && !mouseOverControls && !paused ? 'none' : 'auto',
         }"
         @mousemove="moveOverPlayer"
         ref="player"
         @click.right="showContext"
         @keydown="handleKey"
         @wheel="handleScroll"
         tabindex="1">
        <div class="canvas-center" :style="{
            width: fullscreen ? '100%' : containerBounds.width + 'px',
            height: fullscreen ? '100%' : containerBounds.height + 'px',
            backgroundImage: poster === '' ? 'none' : `url(${poster})`,
            backgroundSize: coverPoster ? 'cover' : 'contain',
        }">
            <canvas
                :style="{
                    opacity: poster === '' || firstPlayLoaded ? 1 : 0,
                    width: canvasBounds.width + 'px',
                    height: canvasBounds.height + 'px',
                }"
                class="canvas"
                ref="canvas"
            />
        </div>
        <div class="controls" @mouseenter="mouseOverControls=true" @mouseleave="mouseOverControls=false"
             v-if="controls && bounds" :style="{
            width: containerBounds.width + 'px',
            height: '85px',
            top: bounds.top + containerBounds.height - 85 + 'px',
            left: bounds.left + 'px',
            opacity: hideControls && !mouseOverControls && !paused ? 0 : readyState < 2 ? 0.5 : 1,
            pointerEvents: readyState < 2 ? 'none' : 'all',
        }">
            <div class="controls-top">
                <div class="controls-left">
                    <div class="play-button" @click="paused ? play() : pause()" :style="{
                        backgroundImage: `url(${playIconUrl})`,
                    }"></div>
                    <div class="time-info">{{ msToTime(currentTime * 1000) }} / {{ msToTime(duration * 1000) }}</div>
                </div>
                <div class="controls-right">
                    <div class="volume">
                        <input type="range" step="0.01" min="0" max="2" v-model="volume" value="1"
                               class="volume-slider">
                        <div class="volume-icon" @click="player.toggleMute()" :style="{
                            backgroundImage: `url(${volumeIconUrl})`,
                        }"></div>
                    </div>
                    <div class="fullscreen-button" v-if="!controlsList.includes('nofullscreen')"
                         @click="toggleFullscreen"></div>
                </div>
            </div>
            <div class="controls-bottom" @mousedown="controlsDown">
                <div class="seek-background">
                    <div class="seek-progress" :style="{
                        width: Math.round(position * 10000) / 100 + '%',
                    }"></div>
                    <div class="seek-thumb" :style="{
                        opacity: mouseOverControls ? 1 : 0,
                        left: `calc(${Math.round(position * 10000) / 100}% - 6px)`,
                    }"></div>
                </div>
            </div>
        </div>
        <div class="status-text" v-if="bounds" :style="{
            top: (bounds.top + 20) + 'px',
            left: bounds.left + 'px',
            opacity: statusOpacity,
            transitionDuration: statusAnimationDuration,
        }" v-html="statusText"/>
        <div class="lds-ring" v-if="bounds && buffering" :style="{
            top: (bounds.top + 20) + 'px',
            left: (bounds.left + 20) + 'px',
        }">
            <div></div>
            <div></div>
            <div></div>
            <div></div>
        </div>
        <div class="media-information" v-if="bounds && showInformation" :style="{
            backgroundColor: dark ? '#333333ee' : '#aaaaaaee',
            color: dark ? '#aaaaaaee': '#333333ee',
            top: (bounds.top + 20) + 'px',
            left: (bounds.left + 20) + 'px',
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
// dont fire scroll event on media information

// copy entire api from HtmlVideoElement for this
// https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement
// https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement
// Inherited members are still required

// Fix setting src to ''
// figure out audio device switching
// Add fullscreen to video submenu? How will we handle this
// Chromecast support? lmao nee

// on loadeddata (when width and height of frame are known, set element size to proper dimensions,
// (what happens for size on src change for htmlvideo?))

import {chimera, enums} from 'wrap-chimera'
import contextMenu from "electron-context-menu";
import path from 'path'

import {nativeImage} from "electron";


export default {
    name: "VlcVideo",
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
        bounds: null,
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
        fullscreen: false,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        mouseOverControls: false,
        icons: {},
        firstPlayLoaded: false,
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
        clearTimeout(this.statusTimeout);
        clearTimeout(this.moveTimeout);
        clearTimeout(this.showBufferTimeout);
        this.player?.destroy?.();
        this.disposeContextMenu?.();
        window.removeEventListener('resize', this.windowResize);
        document.removeEventListener('mousemove', this.controlsMove);
        document.removeEventListener('mouseup', this.controlsUp);
        document.removeEventListener('fullscreenchange', this.changeFullscreen);
    },
    async mounted() {
        let icons = ['pause', 'play_arrow', 'stop', 'volume_up', 'volume_down', 'volume_off', 'volume_off', 'info', 'info'];
        Promise.all(icons.map(this.nativeIcon))
            .then(result => {
                result.forEach((icon, i) => this.icons[icons[i]] = icon);
            });

        this.init();

        this.interval = setInterval(() => {
            if (this.player.state === 'buffering')
                this.showBuffering();
        });

        this.moveTimeout = setTimeout(() => {
            this.hideControls = true;
        }, 1000);

        this.windowResize();
        window.addEventListener('resize', this.windowResize, false);
        document.addEventListener('mousemove', this.controlsMove, false);
        document.addEventListener('mouseup', this.controlsUp, false);
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
            clearTimeout(this.showBufferTimeout);
            this.buffering = true;
            this.showBufferTimeout = setTimeout(() => {
                this.buffering = false;
            }, 500);
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
        controlsDown(e) {
            this.mouseDown = true;
            this.seekByEvent(e);
        },
        controlsMove(e) {
            if (this.mouseDown)
                this.seekByEvent(e);
        },
        controlsUp(e) {
            if (this.mouseDown)
                this.seekByEvent(e);
            this.mouseDown = false;
        },
        seekByEvent(e) {
            // padding 25px
            let x = (e.pageX - this.bounds.left - 25) / (this.bounds.width - 50);
            x = Math.max(0, Math.min(1, x));
            this.player.position = x;
        },
        msToTime(ms, keepMs = false) {
            if (isNaN(ms))
                return `00:00` + keepMs ? '.00' : '';
            let hms = new Date(ms).toISOString().substr(11, keepMs ? 11 : 8).replace(/^0+/, '');
            hms = hms.startsWith(':') ? hms.substr(1) : hms;
            return hms.startsWith('00') ? hms.substr(1) : hms;
        },
        showContext() {
            if (this.disableContextMenu)
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
            if (this.disableScroll)
                return;
            this.player.volume -= e.deltaY / 20;
        },
        handleKey(e) {
            if (this.disableKeys)
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
            if (!this.enableStatusText || this.preventStatusUpdate)
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
            this.bounds = container.getBoundingClientRect();
        },
        toggleFullscreen() {
            if (this.fullscreen) {
                document.exitFullscreen();
            } else {
                let container = this.$refs.player;
                container.requestFullscreen();
            }
        },
        iconUrl(icon) {
            return `https://fonts.gstatic.com/s/i/materialicons/${icon}/v6/24px.svg?download=true`;
        },
        async nativeIcon(icon) {
            return await this.nativeImage(this.iconUrl(icon));
        },
        async nativeImage(url, dark = this.dark) {
            if (!nativeImage.cache)
                nativeImage.cache = {};
            if (!nativeImage.cache[url]) {
                let {black, white} = await this.getSvgIcon(url);
                nativeImage.cache[url] = {
                    black: nativeImage.createFromDataURL(black),
                    white: nativeImage.createFromDataURL(white)
                };
            }
            return nativeImage.cache[url][dark ? 'white' : 'black'];
        },
        /**
         * @param url
         * @param {int} width
         * @param {int} height
         * @returns {Promise<string>}
         */
        async getSvgIcon(url, width = 18, height = 18) {
            return new Promise((resolve, reject) => {
                let img = new Image();
                img.src = url;
                img.crossOrigin = "anonymous";
                img.onload = () => {
                    let canvas = document.createElement('canvas');
                    let context = canvas.getContext('2d');
                    canvas.width = width;
                    canvas.height = height;
                    context.drawImage(img, 0, 0, width, height);
                    let black = canvas.toDataURL();
                    let imgData = context.getImageData(0, 0, img.width, img.height);
                    for (let i = 0; i < imgData.data.length; i += 4) {
                        imgData.data[i] = 255 - imgData.data[i];
                        imgData.data[i + 1] = 255 - imgData.data[i + 1];
                        imgData.data[i + 2] = 255 - imgData.data[i + 2];
                    }
                    context.putImageData(imgData, 0, 0);
                    let white = canvas.toDataURL();
                    resolve({black, white});
                }
                img.onerror = reject;
            })
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
        canvasBounds() {
            let containerRatio = this.containerBounds.width / this.containerBounds.height;
            let width, height;
            if (this.aspectRatio > containerRatio) {
                width = this.containerBounds.width;
                height = this.containerBounds.width / this.aspectRatio;
            } else {
                width = this.containerBounds.height * this.aspectRatio;
                height = this.containerBounds.height;
            }
            return {
                width,
                height,
            };
        },
        containerBounds() {
            if (this.fullscreen)
                return {
                    width: this.windowWidth,
                    height: this.windowHeight,
                }
            let width = this.userWidth;
            let height = this.userHeight;
            if (width === undefined && height === undefined) {
                width = this.videoWidth > 0 ? this.videoWidth : 400;
                height = this.videoHeight > 0 ? this.videoHeight : 225;
            } else if (width === undefined) {
                // Height is user defined
                width = height * this.aspectRatio;
            } else if (height === undefined) {
                // Width is user defined
                height = width / this.aspectRatio;
            }
            return {width, height};
        },
        userWidth() {
            return this.width === 0 ? undefined : +this.width;
        },
        userHeight() {
            return this.height === 0 ? undefined : +this.height;
        },
        menuIconPath() {
            return path.join(__static, `/menu-icons/${this.dark ? 'white' : 'black'}/`);
        },
        volumeIconUrl() {
            let icon = this.muted ? 'volume_off' : this.volume < 1 ? 'volume_down' : 'volume_up';
            return this.iconUrl(icon);
        },
        playIconUrl() {
            let icon = this.paused ? 'play_arrow' : 'pause';
            return this.iconUrl(icon);
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
    --width: 1px;
    --height: 1px;
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
}

.canvas {
    background-color: #292929;
    width: 100%;
    height: auto;
}

.hover {
    position: absolute;
}

.controls {
    transition: opacity 0.3s;
    display: flex;
    flex-direction: column;
    justify-content: center;
    position: absolute;
    background: linear-gradient(0deg, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0) 100%);
}

.controls-top {
    width: calc(100% - 20px);
    padding: 5px 10px 0;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
}

.controls-top > div {
    display: flex;
    align-items: center;
}

.play-button, .volume-icon, .fullscreen-button {
    height: 35px;
    width: 35px;
    border-radius: 50%;
    background-size: 60%;
    background-position: center;
    background-repeat: no-repeat;
    filter: invert();
    cursor: pointer;
    transition: background-color 0.1s;
}

.play-button:hover, .fullscreen-button:hover {
    background-color: rgba(222, 222, 222, 0.5);
}

.play-button {
    margin-right: 10px;
    background-image: url('https://fonts.gstatic.com/s/i/materialicons/play_arrow/v6/24px.svg?download=true');
}

.time-info {
    text-shadow: 0 0 10px black;
    color: white;
    font-size: 14px;
    vertical-align: bottom;
    user-select: none;
    font-family: "Segoe UI", Avenir, Helvetica, Arial, sans-serif;
}

.volume {
    cursor: pointer;
    display: inline-flex;
    border-radius: 20px;
    padding: 0 5px 0 15px;
    transition: background-color 0.2s;
}

.volume:hover {
    background-color: rgba(34, 34, 34, 0.5);
}

.volume-icon {
    display: inline-flex;
}

.volume-slider {
    width: 80px;
    opacity: 0;
    transition: opacity 0.2s;
    filter: grayscale(100%) brightness(150%);
}

.volume-slider::-webkit-slider-thumb {
    filter: grayscale(100%) brightness(10000%);
}

.volume:hover .volume-slider {
    opacity: 1;
}

.fullscreen-button {
    margin-left: 5px;
    background-image: url('https://fonts.gstatic.com/s/i/materialicons/fullscreen/v6/24px.svg?download=true');
}

.controls-bottom {
    cursor: pointer;
    padding: 5px 25px;
    width: calc(100% - 50px);
}

.controls-bottom > * {
    pointer-events: none;
}

.seek-background {
    background-color: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
    height: 4px;
    width: 100%;
}

.seek-progress {
    background-color: white;
    width: 50%;
    height: 4px;
    border-top-left-radius: 2px;
    border-bottom-left-radius: 2px;
}

.seek-thumb {
    width: 12px;
    height: 12px;
    left: calc(50% - 6px);
    top: -8px;
    position: relative;
    background-color: white;
    border-radius: 50%;
    transition: opacity 0.2s;
}

.status-text {
    font-family: "Segoe UI Symbol", Symbol, sans-serif;
    position: absolute;
    font-size: calc(var(--width) / 18);
    width: calc(var(--width) * 0.95);
    text-align: right;
    color: white;
    text-shadow: 0 0 calc(var(--width) / 100) black;
}

.lds-ring {
    position: absolute;
    z-index: 3;
    display: inline-block;
    width: calc(var(--width) / 19);
    height: calc(var(--width) / 19);
}

.lds-ring div {
    /*box-shadow: inset 0 0 calc(var(--width) / 20) 0 rgba(0, 0, 0, 0.1), 0 0 calc(var(--width) / 20) rgba(0, 0, 0, 0.4);*/
    box-sizing: border-box;
    display: block;
    position: absolute;
    width: calc(var(--width) / 20);
    height: calc(var(--width) / 20);
    margin: calc(var(--width) / 100);
    border: calc(var(--width) / 100) solid #fff;
    border-radius: 50%;
    animation: lds-ring 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite;
    border-color: #fff transparent transparent transparent;
}

.lds-ring div:nth-child(1) {
    animation-delay: -0.45s;
}

.lds-ring div:nth-child(2) {
    animation-delay: -0.3s;
}

.lds-ring div:nth-child(3) {
    animation-delay: -0.15s;
}

@keyframes lds-ring {
    0% {
        transform: rotate(0deg);
    }
    100% {
        transform: rotate(360deg);
    }
}


.media-information {
    width: calc(var(--width) - 40px);
    max-height: calc(var(--height) - 40px);

    position: absolute;
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