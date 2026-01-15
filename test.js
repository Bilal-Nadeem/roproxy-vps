//npm install axios
const axios = require("axios");
const https = require("https");

const client = axios.create({
    httpsAgent: new https.Agent({
        rejectUnauthorized: false,
    }),
});
const username = 'mrstark_5vBlJ';
const country = 'US'
const password = 'Lua_987654321'

client
    .get("https://ip.oxylabs.io/location", {
        proxy: {
            protocol: "https",
            host: "dc.oxylabs.io",
            port: 8000,
            auth: {
                username: `user-${username}-country-${country}`,
                password: password,
            },
        },
    })
    .then((res) => {
        console.log(res.data);
    })
    .catch((err) => console.error(err));