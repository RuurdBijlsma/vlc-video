module.exports = {
    configureWebpack: {
    },
    pluginOptions: {
        electronBuilder: {
            externals: ['wcjs-prebuilt'],
            nodeIntegration: true,
            experimentalNativeDepCheck: true,
            builderOptions: {
                publish: ['github'],
                artifactName: "${productName} Setup.${ext}",
                appId: "dev.ruurd.moviemaker",
                productName: "Ruurd Movie Maker",
            },
        }
    },
}