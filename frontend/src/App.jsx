import { useState } from 'react';
import './App.css';

export default function App() {
	const [url, setUrl] = useState('');
	const [loading, isLoading] = useState(false);
	const [results, setResults] = useState([]);
	const [error, setError] = useState('');

	async function recieveResults() {
		setLoading(true);
		try {
			const response = await fetch('');
			if (!response.ok) {
				throw new Error('Network not ok');
			}
			const result = await response.json();
			setResults(result);
		} catch (error) {
			setError(error);
		} finally {
			isLoading(false);
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
				<h2>Results:</h2>
				<div className='isLoading'>{loading && 'Loading ...'}</div>
				<div className='logs'>{results}</div>
			</main>
		</>
	);
}
