const { EmbedBuilder } = require('discord.js');
const { fetch } = require('undici');

const API_KEY = process.env.OPENWEATHER_API_KEY;
const BASE_URL = 'https://api.openweathermap.org/data/2.5/weather';

const WEATHER_EMOJIS = {
    '01d': '☀️', '01n': '🌙',
    '02d': '⛅', '02n': '☁️',
    '03d': '☁️', '03n': '☁️',
    '04d': '☁️', '04n': '☁️',
    '09d': '🌧️', '09n': '🌧️',
    '10d': '🌦️', '10n': '🌧️',
    '11d': '⛈️', '11n': '⛈️',
    '13d': '🌨️', '13n': '🌨️',
    '50d': '🌫️', '50n': '🌫️',
};

function getWeatherEmoji(iconCode) {
    return WEATHER_EMOJIS[iconCode] || '🌡️';
}

function formatTime(timestamp, timezoneOffset) {
    const date = new Date((timestamp + timezoneOffset) * 1000);
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

function celsiusToFahrenheit(celsius) {
    return (celsius * 9 / 5) + 32;
}

async function fetchWeather(city) {
    if (!API_KEY || API_KEY === 'your_openweathermap_api_key_here') {
        return { error: '❌ OpenWeatherMap API key is not configured. Please set `OPENWEATHER_API_KEY` in your `.env` file.\nGet a free key at: https://openweathermap.org/api' };
    }

    const url = `${BASE_URL}?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`;

    try {
        const response = await fetch(url);

        if (response.status === 404) {
            return { error: `❌ City not found: **${city}**. Please check the spelling and try again.` };
        }

        if (response.status === 401) {
            return { error: '❌ Invalid API key. Please check your `OPENWEATHER_API_KEY` in `.env`.' };
        }

        if (!response.ok) {
            return { error: `❌ Failed to fetch weather data (HTTP ${response.status}). Please try again later.` };
        }

        const data = await response.json();
        return { data };
    } catch (err) {
        console.error('Weather API error:', err);
        return { error: '❌ An error occurred while fetching weather data. Please try again later.' };
    }
}

module.exports = {
    name: 'weather',
    description: 'Get current weather for a city',
    usage: '!weather <city>',
    aliases: ['w', 'wt'],
    category: 'utility',
    async execute(message, args) {
        try {
            if (!args.length) {
                return message.reply('❌ Please specify a city!\nUsage: `!weather <city>`\nExample: `!weather London`');
            }

            const city = args.join(' ');
            const result = await fetchWeather(city);

            if (result.error) {
                return message.reply(result.error);
            }

            const data = result.data;
            const weather = data.weather[0];
            const main = data.main;
            const wind = data.wind;
            const sys = data.sys;
            const emoji = getWeatherEmoji(weather.icon);
            const tempC = Math.round(main.temp);
            const feelsLikeC = Math.round(main.feels_like);
            const tempF = Math.round(celsiusToFahrenheit(tempC));
            const feelsLikeF = Math.round(celsiusToFahrenheit(feelsLikeC));
            const humidity = main.humidity;
            const pressure = main.pressure;
            const visibility = data.visibility ? (data.visibility / 1000).toFixed(1) : 'N/A';
            const windSpeed = wind.speed;
            const windDeg = wind.deg;
            const sunrise = formatTime(sys.sunrise, data.timezone);
            const sunset = formatTime(sys.sunset, data.timezone);
            const country = sys.country || '';
            const cityName = data.name;
            const description = weather.description.charAt(0).toUpperCase() + weather.description.slice(1);

            // Wind direction
            const windDirections = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
            const windDir = windDirections[Math.round(windDeg / 22.5) % 16];

            const embed = new EmbedBuilder()
                .setColor('#3498db')
                .setTitle(`${emoji} Weather in ${cityName}${country ? ', ' + country : ''}`)
                .setDescription(`**${description}**`)
                .addFields(
                    { name: '🌡️ Temperature', value: `${tempC}°C / ${tempF}°F`, inline: true },
                    { name: '🤔 Feels Like', value: `${feelsLikeC}°C / ${feelsLikeF}°F`, inline: true },
                    { name: '💧 Humidity', value: `${humidity}%`, inline: true },
                    { name: '💨 Wind', value: `${windSpeed} m/s ${windDir}`, inline: true },
                    { name: '📊 Pressure', value: `${pressure} hPa`, inline: true },
                    { name: '👁️ Visibility', value: `${visibility} km`, inline: true },
                    { name: '🌅 Sunrise', value: sunrise, inline: true },
                    { name: '🌇 Sunset', value: sunset, inline: true }
                )
                .setThumbnail(`https://openweathermap.org/img/wn/${weather.icon}@2x.png`)
                .setFooter({ text: 'OpenWeatherMap • Free API' })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in weather command:', error);
            message.reply('❌ An error occurred while using the weather command!');
        }
    },
};