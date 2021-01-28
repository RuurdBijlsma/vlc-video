<template>
    <div class="controls">
        <div class="controls-top">
            <div class="controls-left">
                <div class="play-button" v-if="bounds.width > 55"
                     @click="paused ? $emit('play') : $emit('pause')"
                     :style="{backgroundImage: `url(${playIconUrl})`}"></div>
                <div class="time-info" v-if="bounds.width > 95">
                    <span>{{ msToTime(currentTime * 1000) }}</span>
                    <span v-if="bounds.width > 335 && !isNaN(duration)"> / {{ msToTime(duration * 1000) }}</span>
                </div>
            </div>
            <div class="controls-right">
                <div class="volume" v-if="bounds.width > 275">
                    <input type="range" step="0.01" min="0" max="2"
                           :value="value" @input="$emit('input', $event.target.value)"
                           class="volume-slider">
                    <div class="volume-icon" @click="$emit('toggleMute')" :style="{
                            backgroundImage: `url(${volumeIconUrl})`,
                        }"></div>
                </div>
                <div class="fullscreen-button" v-if="!disableFullscreen && bounds.width > 135"
                     @click="$emit('toggleFullscreen')"></div>
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
</template>

<script>
import Utils from "./utils";

export default {
    name: "Controls",
    props: {
        bounds: {
            type: Object,
            required: true,
        },
        position: {
            type: Number,
            required: true,
        },
        duration: {
            type: Number,
            required: true,
        },
        currentTime: {
            type: Number,
            required: true,
        },
        paused: {
            type: Boolean,
            required: true,
        },
        mouseOverControls: {
            type: Boolean,
            required: true,
        },
        value: {
            type: Number,
            required: true,
        },
        muted: {
            type: Boolean,
            required: true,
        },
        disableFullscreen: {
            type: Boolean,
            default: false,
        },
    },
    data: () => ({
        fullscreen: false,
    }),
    beforeDestroy() {
        document.removeEventListener('mousemove', this.controlsMove);
        document.removeEventListener('mouseup', this.controlsUp);
    },
    mounted() {
        document.addEventListener('mousemove', this.controlsMove, false);
        document.addEventListener('mouseup', this.controlsUp, false);
    },
    methods: {
        msToTime(ms, keepMs = false) {
            return Utils.msToTime(ms, keepMs);
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
            this.$emit('seek', x);
        },
    },
    computed: {
        volumeIconUrl() {
            let icon = this.muted ? 'volume_off' : this.volume < 1 ? 'volume_down' : 'volume_up';
            return Utils.iconUrl(icon);
        },
        playIconUrl() {
            let icon = this.paused ? 'play_arrow' : 'pause';
            return Utils.iconUrl(icon);
        },
    }
}
</script>

<style scoped>
.controls {
    transition: opacity 0.3s;
    display: flex;
    flex-direction: column;
    justify-content: center;
    width: 100%;
    height: 85px;
    position: absolute;
    bottom: 0;
    left: 0;
    z-index: 3;
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
</style>