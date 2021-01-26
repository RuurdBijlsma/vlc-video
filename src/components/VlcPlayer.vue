<template>
    <div class="vlc-player"
         ref="player"
         @click.right="showContext"
         @keydown="handleKey"
         @wheel="handleScroll"
         tabindex="1">
        <div class="canvas-center">
            <canvas
                :style="{
                    width: canvasBounds.width + 'px',
                    height: canvasBounds.height + 'px',
                }"
                class="canvas"
                ref="canvas"
            />
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
// copy entire api from HtmlVideoElement for this
// https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement
// https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement

// figure out audio device switching
// Add fullscreen to video submenu? How will we handle this
// Chromecast support? lmao nee

import {chimera, enums} from 'wrap-chimera'
import contextMenu from "electron-context-menu";

export default {
    name: "VlcPlayer",
    props: {
        dark: {
            type: Boolean,
            default: false,
        },
        src: {
            type: String,
            default: '',
        },
        disableStatusText: {
            type: Boolean,
            default: false,
        },
        disableContextMenu: {
            type: Boolean,
            default: false,
        },
    },
    data: () => ({
        player: null,
        disposeContextMenu: null,
        showContextMenu: false,
        showInformation: false,
        informationContent: '',
        bounds: null,
        statusText: '',
        statusAnimationDuration: '0s',
        statusTimeout: -1,
        statusOpacity: 0,
        buffering: false,
        interval: null,
    }),
    beforeDestroy() {
        clearInterval(this.interval);
        clearTimeout(this.statusTimeout);
        this.player?.destroy?.();
        this.disposeContextMenu?.();
        window.removeEventListener('resize', this.windowResize);
    },
    async mounted() {
        this.player = chimera.createPlayer();
        this.player.on('play', () => this.showStatusText('▶'));
        this.player.on('pause', () => this.showStatusText('⏸'));
        this.player.on('stop', () => this.showStatusText('⏹'));
        this.player.on('mute', () => this.showStatusText('🔇'));
        this.player.on('unmute', () => this.showStatusText(`🔊 ${Math.round(this.player.volume)}%`));
        this.player.on('volumeChange', v => this.showStatusText(`${this.player.mute ? '🔇' : '🔊'} ${Math.round(v)}%`));
        this.player.input.on('rateChange', v => this.showStatusText(`🐢 ${v.toFixed(2)}x`));
        this.player.on('seek', () => this.showStatusText(`${this.msToTime(this.player.time)} / ${this.msToTime(this.player.duration)}`));

        this.player.on('stateChange', () => {
            this.buffering = this.state === 'buffering';
        });
        this.interval = setInterval(() => {
            this.buffering = this.state === 'buffering';
        }, 1000 / 60);

        let canvas = document.querySelector(".canvas");
        console.log('init vlc player', canvas, chimera, this.player);

        this.player.bindCanvas(canvas);
        this.player.on('error', err => console.warn(err));

        this.windowResize();
        window.addEventListener('resize', this.windowResize, false);
        this.disposeContextMenu = this.createContextMenu();

        this.loadSrc();
    },
    methods: {
        msToTime(ms) {
            if (isNaN(ms))
                return `00:00.00`;
            let hms = new Date(ms).toISOString().substr(11, 11)
            if (hms.startsWith('00'))
                return hms.substr(3);
            return hms;
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
                        icon: this.menuIconPath + 'pause.png',
                        visible: this.showContextMenu && this.player.playing,
                        click: () => {
                            this.player.pause();
                        }
                    },
                    {
                        label: 'Play',
                        accelerator: 'Space',
                        icon: this.menuIconPath + 'play.png',
                        visible: this.showContextMenu && !this.player.playing,
                        click: () => {
                            this.player.play();
                        }
                    },
                    {
                        label: 'Stop',
                        accelerator: 'MediaStop',
                        icon: this.menuIconPath + 'stop.png',
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
                                icon: this.menuIconPath + 'volume_up.png',
                                visible: this.showContextMenu,
                                enabled: this.player.volume < 200,
                                click: () => this.player.volume += 10
                            },
                            {
                                label: 'Decrease volume',
                                accelerator: '-',
                                icon: this.menuIconPath + 'volume_down.png',
                                visible: this.showContextMenu,
                                enabled: this.player.volume > 0,
                                click: () => this.player.volume -= 10
                            },
                            {
                                label: 'Mute',
                                accelerator: 'm',
                                icon: this.menuIconPath + 'volume_off.png',
                                visible: this.showContextMenu && !this.player.mute,
                                click: () => this.player.mute = true
                            },
                            {
                                label: 'Unmute',
                                accelerator: 'm',
                                icon: this.menuIconPath + 'volume_off.png',
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
                                    label: track,
                                    type: 'radio',
                                    checked: i === this.player.video.track,
                                    click: () => this.player.video.track = i,
                                })),
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
                                icon: this.menuIconPath + 'media_info.png',
                                click: () => {
                                    this.showInformation = true;
                                    let media = this.player.playlist.items[0];
                                    if (media === undefined)
                                        this.informationContent = 'No info';
                                    else {
                                        let text = '';
                                        let properties = ['mrl', 'duration', 'title', 'artist', 'genre', 'copyright', 'album', 'trackNumber',
                                            'description', 'rating', 'date', 'URL', 'language',
                                            'nowPlaying', 'publisher', 'encodedBy', 'artworkURL', 'trackID']
                                        for (let key of properties) {
                                            let value = media[key];
                                            text += `<div><b>${key}: </b>${value}</div>`;
                                        }
                                        this.informationContent = text;
                                    }
                                },
                            },
                            // No codec info available
                            // {
                            //     label: 'Codec information',
                            //     icon: this.menuIconPath + 'info.png',
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
            this.player.volume -= e.deltaY / 20;
        },
        handleKey(e) {
            console.log(e.key);
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
                console.log("Loading subtitles", filePath);
                this.player.subtitles.load(filePath)
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
            if (this.disableStatusText)
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
            this.player.playUrl(this.src);

            this.player.once('play', async () => {
                setTimeout(() => {
                    this.player.pause();
                }, 3000);
            });
        },
        windowResize() {
            let container = this.$refs.player;
            this.bounds = container.getBoundingClientRect();
            container.style.setProperty('--width', this.bounds.width + 'px');
            container.style.setProperty('--height', this.bounds.height + 'px');
        },
    },
    computed: {
        currentTime:{
            cache: false,
            get(){
                return this.player.time / 1000;
            },
        },
        videoWidth:{
            cache: false,
            get(){
                return this.player.input.width;
            },
        },
        videoHeight:{
            cache: false,
            get(){
                return this.player.input.height;
            },
        },
        canvasBounds() {
            if (this.bounds === null)
                return {width: 400, height: 225};

            let width = this.widerThanContainer ? this.bounds.width : Math.round(this.bounds.height * this.aspectRatio)
            let height = this.widerThanContainer ? Math.round(this.bounds.width / this.aspectRatio) : this.bounds.height
            return {width, height};
        },
        widerThanContainer() {
            if (this.bounds === null)
                return false;
            let containerRatio = this.bounds.width / this.bounds.height;
            return this.aspectRatio > containerRatio;
        },
        aspectRatio() {
            if (this.player === null)
                return 1;
            return this.player.input.width / this.player.input.height;
        },
        menuIconPath() {
            return `public/menu-icons/${this.dark ? 'white' : 'black'}/`
        },
    },
    watch: {
        src() {
            this.loadSrc()
        },
    },
}
</script>

<style scoped>
.vlc-player {
    background-color: black;
    --width: 100px;
    --height: 100px;
}

.vlc-player:focus {
    outline: none;
}

.canvas-center {
    width: 100%;
    height: 100%;
    display: flex;
    place-items: center;
    justify-content: center;
    z-index: 1;
}

.canvas {
    width: 100%;
    height: auto;
}

.status-text {
    font-family: "Segoe UI Symbol", Symbol, sans-serif;
    position: fixed;
    font-size: calc(var(--width) / 18);
    width: calc(var(--width) * 0.95);
    text-align: right;
    color: white;
    text-shadow: 0 0 calc(var(--width) / 100) black;
}

.lds-ring {
    position: fixed;
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

    position: fixed;
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