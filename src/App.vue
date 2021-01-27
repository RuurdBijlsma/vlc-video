<template>
    <div id="app">
        <h1>Vlc Video</h1>
        <vlc-video height="300" controls ref="player" class="player" dark src="http://localhost:3000/filetest"/>
        <h1>HTML Video</h1>
        <video height="300" controls class="player" src="http://localhost:3000/filetest"/>
    </div>
</template>

<script>
import VlcVideo from "@/components/VlcVideo";

export default {
    name: 'App',
    components: {VlcVideo},
    mounted() {
        console.log(this.$refs.player);
    },
}
</script>

<style>
#app {
    /*background-color: lime;*/
    font-family: Avenir, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-align: center;
    color: #2c3e50;
    margin-top: 60px;
}

.player {
    /*width: calc(100% - 200px);*/
    height: 300px;
}
</style>
