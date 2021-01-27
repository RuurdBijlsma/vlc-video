<template>
    <div id="app">
        <h1>Player</h1>
        <!--        <vlc-player controls dark src="http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"/>-->
        <vlc-player loop controls width="500" ref="player" class="player" dark src="http://localhost:3000/filetest"/>
        <video controls width="500" class="player" src="http://localhost:3000/filetest"/>
        <p>controls</p>
    </div>
</template>

<script>
import VlcPlayer from "@/components/VlcPlayer";

export default {
    name: 'App',
    components: {VlcPlayer},
    mounted() {
        console.log(this.$refs.player);
    },
}
</script>

<style>
#app {
    font-family: Avenir, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-align: center;
    color: #2c3e50;
    margin-top: 60px;
}

.player {
    /*width: calc(100% - 200px);*/
    /*height: 300px;*/
}
</style>
