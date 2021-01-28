import {nativeImage} from "electron";

export default class Utils {
    static msToTime(ms, keepMs = false) {
        if (isNaN(ms))
            return `00:00` + keepMs ? '.00' : '';
        let hms = new Date(ms).toISOString().substr(11, keepMs ? 11 : 8).replace(/^0+/, '');
        hms = hms.startsWith(':') ? hms.substr(1) : hms;
        return hms.startsWith('00') ? hms.substr(1) : hms;
    }

    static iconUrl(icon) {
        return `https://fonts.gstatic.com/s/i/materialicons/${icon}/v6/24px.svg?download=true`;
    }

    static async nativeIcon(icon) {
        return await Utils.nativeImage(Utils.iconUrl(icon));
    }

    static async nativeImage(url, dark = true) {
        if (!nativeImage.cache)
            nativeImage.cache = {};
        if (!nativeImage.cache[url]) {
            let {black, white} = await Utils.getSvgIcon(url);
            nativeImage.cache[url] = {
                black: nativeImage.createFromDataURL(black),
                white: nativeImage.createFromDataURL(white)
            };
        }
        return nativeImage.cache[url][dark ? 'white' : 'black'];
    }

    /**
     * @param url
     * @param {int} width
     * @param {int} height
     * @returns {Promise<string>}
     */
    static async getSvgIcon(url, width = 18, height = 18) {
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
    }
}