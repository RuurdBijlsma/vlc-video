module.exports = {
    pluginOptions: {
        electronBuilder: {
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