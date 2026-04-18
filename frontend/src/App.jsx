import { useState } from 'react';
import './App.css';

export default function App() {
	const [url, setUrl] = useState('');
	const [results, setResults] = useState([]);

	async function recieveResults() {
		const response = await fetch(url);
		if (response != 'ok') {
			throw new Error('Network not ok');
		}
	}

	return (
		<>
			<header>
				<h1>LLM Protector</h1>
			</header>
			<main>
				<input
					type='search'
					className='input'
					placeholder='What LLM url should be tested?'
					onChange={(e) => setUrl(e)}
					onKeyDown={(e) => e.key === 'Enter' && recieveResults}
				/>
				<button onClick={recieveResults}>Search</button>
				<br />
				<div className='section-divider'></div>
				<br />
				<div className='logs'>{results}</div>
			</main>
		</>
	);
}
