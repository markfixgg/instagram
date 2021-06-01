const {IgApiClient, IgLoginTwoFactorRequiredError, IgLoginBadPasswordError, IgResponseError} = require('instagram-private-api');
const shttps = require('socks-proxy-agent'); // you should install SOCKS5 client via: npm i socks-proxy-agent
const Bluebird = require('bluebird');
const inquirer = require('inquirer');
const { parentPort, workerData } = require('worker_threads');

const ig = new IgApiClient();

const {username, password, proxy} = workerData;

const {0: proxy_host, 1: proxy_port, 2: proxy_login, 3: proxy_password} = proxy.split(':');

ig.state.generateDevice(username);
ig.request.defaults.agentClass = shttps; // apply agent class to request library defaults

ig.request.defaults.agentOptions = {
    hostname: proxy_host, // proxy hostname
    port: proxy_port, // proxy port
    protocol: 'socks:', // supported: 'socks:' , 'socks4:' , 'socks4a:' , 'socks5:' , 'socks5h:'
    username: proxy_login, // proxy username, optional
    password: proxy_password, // proxy password, optional
};

ig.request.end$.subscribe(async () => {
    const serialized = await ig.state.serialize();
    delete serialized.constants; // this deletes the version info, so you'll always use the version provided by the library
    const cookies = JSON.parse(serialized.cookies);

    cookies.cookies.map(item => {
        if(item.key === 'sessionid') return parentPort.postMessage({success: true, sessionid: item.value})
    })
});

return Bluebird.try(() => ig.account.login(username, password)).catch(
    IgLoginTwoFactorRequiredError,
    async err => {
        const {username, totp_two_factor_on, two_factor_identifier} = err.response.body.two_factor_info;
        // decide which method to use
        const verificationMethod = totp_two_factor_on ? '0' : '1'; // default to 1 for SMS
        // At this point a code should have been sent
        // Get the code
        const { code } = await inquirer.prompt([
            {
                type: 'input',
                name: 'code',
                message: `Enter code received via ${verificationMethod === '1' ? 'SMS' : 'TOTP'}`,
            },
        ]);
        // Use the code to finish the login process
        return ig.account.twoFactorLogin({
            username,
            verificationCode: code,
            twoFactorIdentifier: two_factor_identifier,
            verificationMethod, // '1' = SMS (default), '0' = TOTP (google auth for example)
            trustThisDevice: '1', // Can beе omitted as '1' is used by default
        });
    },
)
.catch(e => {
    const custom_errors = {
        "IgLoginBadPasswordError": 'Неверный логин или пароль',
        "IgResponseError": '[429] Слишком много запросов, или прокси не валидный',
        "RequestError": "Не валидный прокси"
    }
    return parentPort.postMessage({success: true, error: custom_errors[e.name] ? custom_errors[e.name] : e.message})
});