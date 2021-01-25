<template>
    <canvas
        @click.right="showContext"
        class="canvas"
        ref="canvas"
    />
</template>

<script>
// TODO
// add property to wrap chimera player -> has video or something
// add accelerators to menu items https://www.electronjs.org/docs/api/accelerator
// make proper dispose function for wrap chimera (renderer is bad)
// figure out audio device switching
// copy entire api from HtmlVideoElement for this
// show volume percentage on player maybe (does add gui part which might be bad, maybe add prop to make this optional)
// change wrap chimera maybe, if volume increased, set mute = false
// can video track have name??
// Add fullscreen to video submenu? How will we handle this
// media/codec information submenu thing
// show buffering visual feedback
// add key binds (maybe through accelerator stuff)
// do video resize properly if possible
// make sure initial load is smooth

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
    },
    data: () => ({
        player: null,
        disposeContextMenu: null,
        showContextMenu: false,
    }),
    beforeDestroy() {
        this.player?.stop?.();
        this.disposeContextMenu?.();
    },
    async mounted() {
        this.loadSrc();
        this.disposeContextMenu = this.createContextMenu();
    },
    methods: {
        showContext() {
            this.showContextMenu = true;
            setTimeout(() => this.showContextMenu = false, 10);
        },
        createContextMenu() {
            return contextMenu({
                prepend: () => [
                    {
                        label: 'Pause',
                        icon: this.menuIconPath + 'pause.png',
                        visible: this.showContextMenu && this.player.playing,
                        click: () => {
                            this.player.pause();
                        }
                    },
                    {
                        label: 'Play',
                        icon: this.menuIconPath + 'play.png',
                        visible: this.showContextMenu && !this.player.playing,
                        click: () => {
                            this.player.play();
                        }
                    },
                    {
                        label: 'Stop',
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
                        visible: this.showContextMenu && this.player.state !== 'Stopped',
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
                                icon: this.menuIconPath + 'volume_up.png',
                                visible: this.showContextMenu,
                                enabled: this.player.volume < 200,
                                click: () => this.player.volume += 10
                            },
                            {
                                label: 'Decrease volume',
                                icon: this.menuIconPath + 'volume_down.png',
                                visible: this.showContextMenu,
                                enabled: this.player.volume > 0,
                                click: () => this.player.volume -= 10
                            },
                            {
                                label: 'Mute',
                                icon: this.menuIconPath + 'volume_off.png',
                                visible: this.showContextMenu && !this.player.mute,
                                click: () => this.player.mute = true
                            },
                            {
                                label: 'Unmute',
                                icon: this.menuIconPath + 'volume_off.png',
                                visible: this.showContextMenu && this.player.mute,
                                click: () => this.player.mute = false
                            },
                        ],
                    },
                    {
                        label: 'Video',
                        visible: this.showContextMenu && this.player.state !== 'Stopped',
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
                        ],
                    },
                    {
                        label: 'Subtitles',
                        visible: this.showContextMenu && this.player.state !== 'Stopped',
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
                ],
            });
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
        loadSrc() {
            this.player = chimera.createPlayer();
            let canvas = document.querySelector(".canvas");
            console.log('init', canvas, chimera, this.player);

            this.player.bindCanvas(canvas);
            this.player.on('pause', () => console.log("PAUSED"));
            this.player.on('error', err => console.warn(err));
            // this.player.on('message',(level, message, format) => console.log(level, message));

            this.player.playUrl(this.src);
            console.log('src', this.src);

            this.player.once('play', async () => {
                setTimeout(() => {
                    this.player.pause();
                }, 3000);
            });
        },
    },
    computed: {
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
.canvas {
    width: 100%;
    height: auto;
}
</style>