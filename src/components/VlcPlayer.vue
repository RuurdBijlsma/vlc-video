<template>
    <div>
        <input type="button" @click="loadSrc" value="blick">
        <canvas class="canvas" ref="canvas"></canvas>
    </div>
</template>

<script>
// Probleem is:
// Webpack (?) zet het object gereturnt door onFrameReady om van type I420VideoFrame naar uint8array
// waardoor de uOffset, vOffset, width, height en pixelformat verloren gaat

// const renderer = __non_webpack_require__('./src/js/WrapChimera/customRenderer.js')

// const wc = __non_webpack_require__('./src/js/WrapChimera/CustomChimera.node')
// let wc = __non_webpack_require__('wcjs-prebuilt')
// const {chimera} = __non_webpack_require__('wrapchimera')

// console.log(chimera)
// const nr = require('@tybys/native-require')
// const nativeRequire = nr.tryGetRequireFunction();
// let {chimera} = nativeRequire('./src/js/WrapChimera')
// let wc = require('electron').remote.require('wcjs-prebuilt');
// const {chimera} = require('wrap-chimera')
import {chimera} from 'wrap-chimera'

export default {
    name: "VlcPlayer",
    props: {
        src: {
            type: String,
            default: '',
        },
    },
    data: () => ({
        player: null,
    }),
    beforeDestroy() {
        this.player.stop();
    },
    async mounted() {
        console.log(chimera)
        this.loadSrc()
    },
    methods: {
        loadSrc() {
            const url = 'http://localhost:3000/filetest';
            this.player = chimera.createPlayer();
            let canvas = document.querySelector(".canvas");

            console.log('init', canvas, chimera, this.player);

            this.player.bindCanvas(canvas);
            // player.on('pause', () => console.log("PAUSED"));
            this.player.onLogMessage = (level, message, format) => console.log(level, message)
            this.player.onFrameSetup = console.warn;
            this.player.onFrameReady = console.warn;
            this.player.onEncounteredError = console.warn
            // player.on('error', console.warn);

            this.player.playUrl(url);
            // player.on('play', () => setTimeout(() => player.pause(), 5000))

            // console.log("fps", await player.getFps());
            this.player.onPlaying = setTimeout(() => {
                this.player.pause();
            }, 50000);

            console.log(require('electron').remote);
        },
    },
    watch: {},
}
</script>

<style scoped>
.canvas {
    width: 100%;
    height: auto;
}
</style>