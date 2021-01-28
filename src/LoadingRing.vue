<template>
    <div class="lds-ring">
        <div></div>
        <div></div>
        <div></div>
        <div></div>
    </div>
</template>

<script>
export default {
    name: "LoadingRing"
}
</script>

<style scoped>
.lds-ring {
    display: inline-block;
    width: 15%;
    height: 15%;
}

.lds-ring div {
    box-sizing: border-box;
    display: block;
    position: absolute;
    width: calc(var(--width) / 10);
    height: calc(var(--width) / 10);
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
</style>