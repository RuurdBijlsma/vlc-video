<template>
    <div id="app">
        <h1>Player</h1>
        <vlc-player src="http://localhost:3000/filetest"></vlc-player>
        <p>controls</p>
    </div>
</template>

<script>
import VlcPlayer from "@/components/VlcPlayer";

export default {
    name: 'App',
    components: {VlcPlayer}
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
</style>
