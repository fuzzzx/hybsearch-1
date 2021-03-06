'use strict'

const parseNewick = require('../vendor/newick').parse
const d3 = require('d3')
const path = require('path')
d3.phylogram = require('../vendor/d3.phylogram')
const childProcess = require('child_process')
const ent = require('../lib/ent')
require('../vendor/array.proto.includes')


function onMessage(packet, args, child) {
	let [cmd, msg] = packet
	switch (cmd) {
		case 'begin': {
			args.start = performance.now()
			args.label = msg
			beginLoadingStatus(msg)
			break
		}
		case 'complete': {
			let taken = performance.now() - args.start
			updateLoadingStatus(msg, taken.toFixed(2))
			break
		}
		case 'error': {
			console.error(msg)
			let taken = performance.now() - args.start
			setLoadingError(args.label, taken.toFixed(2))
			child.disconnect()
			break
		}
		case 'exit': {
			child.disconnect()
			break
		}
		case 'finish': {
			load(parseNewick(msg))
			break
		}
		default: {
			throw new Error(`unknown cmd "${cmd}"`)
		}
	}
}

function loadAndProcessData(e) {
	let file = e.target.files[0]
	console.log('The file is', file.path)

	document.querySelector('section.loader').classList.add('loading')

	let mutableArgs = {
		start: performance.now(),
		label: 'process',
	}
	let child = childProcess.fork(path.join(__dirname, '..', 'lib', 'worker.js'))

	// still doesn't work.
	// current problem: the calls to execSync in `child`s children
	// don't get the signal.
	let killChildProcess = () => child.kill()
	process.on('exit', killChildProcess)
	window.addEventListener('beforeunload', killChildProcess)

	child.on('message', packet => onMessage(packet, mutableArgs, child))
	child.on('disconnect', console.log.bind(console, 'disconnect'))
	child.on('error', console.log.bind(console, 'error'))
	child.on('exit', console.log.bind(console, 'exit'))

	child.send(file.path, err => {
		if (err) {
			console.error('child error', err)
		}
	})

	return false
}


document.getElementById('load-file').addEventListener('change', loadAndProcessData)


document.getElementById('tree-box-submit').addEventListener('click', e => {
	e.preventDefault()
	var data = document.getElementById('tree-box').value
	load(parseNewick(data))
})

document.getElementById('json-tree-box-submit').addEventListener('click', e => {
	e.preventDefault()
	let data = document.getElementById('tree-box').value
	load(JSON.parse(data))
})

function updateLoadingStatus(label, timeTaken) {
	console.info(`finished ${label} in ${timeTaken}ms`)
	let el = document.querySelector(`.checkmark[data-loader-name='${label}']`)
	el.classList.remove('active')
	el.classList.add('complete')
	el.dataset.time = timeTaken
}

function showTime(ms) {
	console.info(`completed in ${ms} ms`)
	document.querySelector(`.time-taken`).textContent = `${ms}ms`
}

function beginLoadingStatus(label) {
	console.info(`beginning ${label}`)
	document.querySelector(`.checkmark[data-loader-name='${label}']`).classList.add('active')
}

function setLoadingError(label, timeTaken) {
	console.info(`error in ${label} (after ${timeTaken}ms)`)
	let el = document.querySelector(`.checkmark[data-loader-name='${label}']`)
	el.classList.add('error')
	el.dataset.time = timeTaken
}

function load(newick) {
	const newickNodes = []
	function buildNewickNodes(node) {
		newickNodes.push(node)
		if (node.branchset) {
			node.branchset.forEach(buildNewickNodes)
		}
	}

	buildNewickNodes(newick)
	let nmResults = ent.strictSearch(newick)
	let results = ent.formatData(nmResults)
	let resultsEl = document.querySelector('#nonmonophyly-results')
	resultsEl.innerHTML = `<pre>${results}</pre>`
	document.querySelector('#nm-container').hidden = false

	console.log('Got nodes:', newickNodes)
	console.log('nonmonophyly:', nmResults)

	// Scale the generated tree based on largest branch length
	const smallest = getSmallestLength(newickNodes)
	const largest = getLargestLength(newickNodes)
	const ratio = (largest / smallest) * 15
	const maxWidth = document.getElementById('phylogram').offsetWidth - 320 // Accounts for label widths
	const calcWidth = Math.max(500, Math.min(maxWidth, ratio))

	console.log(`Final calcWidth: ${calcWidth}, maxWidth: ${maxWidth}, ratio: ${ratio}, largest: ${largest}, smallest: ${smallest}`)

	const calcHeight = 800 * Math.min(5, Math.max(0.35, newickNodes.length / 65))
	d3.phylogram.build('#phylogram', newick, {
		width: calcWidth,
		height: calcHeight,
		formatLeafNodeLabel: node => `${node.name} [${node.ident}] (${node.length})`,
		nonmonophyly: nmResults.nm.map(pair => pair.map(node => node.ident)),
	})
}

function getExtremeLength(list, extreme, compare) {
	list.forEach(obj => {
		let length = obj.length
		if (length && length < extreme) {
			extreme = length
		}

		if (obj.branchset && obj.branchset.length > 0) {
			let alt = getExtremeLength(obj.branchset, extreme, compare)
			if (compare(alt, extreme)) {
				extreme = alt
			}
		}
	})

	return extreme
}

function getSmallestLength(objs) {
	let lessthan = (a, b) => a < b
	return getExtremeLength(objs, Infinity, lessthan)
}

function getLargestLength(objs) {
	let greaterthan = (a, b) => a > b
	return getExtremeLength(objs, 0, greaterthan)
}

// Whitelist is an array of individuals for a single species. Anything not
// in this whitelist must be nonmono
function findOutliers(objs, whitelist, found=[]) {
	objs.forEach(obj => {
		if (obj.name && obj.name !== '' && !whitelist.includes(obj.name)) {
			found.push(`${obj.name}_${obj.length}`)
		}

		if (obj.branchset && obj.branchset.length > 0) {
			found = findOutliers(obj.branchset, whitelist, found)
		}
	})

	return found
}

function onNodeClicked(data) {
	console.log('Clicked on node point with data:', data)

	let outliers = findOutliers(data.branchset, getWhitelist())
	console.log('Outliers found:', outliers)

	outliers.forEach(outlier => {
		document.getElementById(outlier).setAttribute('fill', 'green')
	})

	alert('Node analysis complete! Non-dominant species for the specified subtree are marked green. For a comprehensive list, please view the browser console logs.')
}

function getWhitelist() {
	return document.getElementById('dominantSpeciesInput').value.trim().split(/,\s*/)
}
