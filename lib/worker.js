'use strict'

require('loud-rejection/register')
const fs = require('fs')

const serializeError = require('serialize-error')
const fileExt = require('file-extension')

const genbankToFasta = require('../bin/genbank-fasta')
const clustal = require('../bin/clustal-o')
const fastaToNexus = require('../bin/fasta-to-nexus')
const mrBayes = require('../bin/mrbayes')
const consensusTreeToNewick = require('../bin/consensus-newick')

process.on('disconnect', () => {
	console.error('disconnected')
	process.exit(0)
})

// process.on('message', console.error.bind(console))

const logData = arr => console.log(JSON.stringify(arr))
const sendData = arr => process.send(arr)
const sendFunc = process.send ? sendData : logData
const send = (cmd, msg) => sendFunc([cmd, msg])

const begin = msg => send('begin', msg)
const complete = msg => send('complete', msg)
const error = e => send('error', serializeError(e))
const returnData = data => send('finish', data)
const exit = () => send('exit')

function readFile(path) {
	return new Promise((resolve, reject) => {
		fs.readFile(path, 'utf-8', (err, data) => {
			if (err) {
				reject(err)
			}
			resolve(data)
		})
	})
}

// async function loadEvaluate(path) {
// 	let data = await readFile(path)

// 	begin('process')
// 	let fasta = data
// 	if (fileExt(path) !== 'fasta') {
// 		fasta = genbankToFasta(data)
// 	}
// 	complete('process')

// 	begin('align')
// 	let aligned = await clustal(fasta)
// 	complete('align')

// 	begin('convert')
// 	let nexus = await fastaToNexus(aligned)
// 	complete('convert')

// 	begin('generate')
// 	let tree = await mrBayes(nexus)
// 	complete('generate')

// 	begin('condense')
// 	let newickTree = await consensusTreeToNewick(tree)
// 	complete('condense')

// 	return newickTree
// }

function loadAndEvaluate(path) {
	return readFile(path)
		.then(data => {
			begin('process')
			let fasta = data
			if (fileExt(path) !== 'fasta') {
				fasta = genbankToFasta(data)
			}
			return fasta
		}).then(fasta => {
			complete('process')
			begin('align')
			return clustal(fasta)
		}).then(aligned => {
			complete('align')
			begin('convert')
			return fastaToNexus(aligned)
		}).then(nexus => {
			complete('convert')
			begin('generate')
			return mrBayes(nexus)
		}).then(tree => {
			complete('generate')
			begin('condense')
			return consensusTreeToNewick(tree)
		}).then(newickTree => {
			complete('condense')
			returnData(newickTree)
			exit()
		}).catch(err => {
			error(err)
			console.error(err)
		})
}

function main(file) {
	if (!file) {
		error('no file given')
		console.error('usage: node worker.js <inputfile>')
		process.exit(1)
	}

	loadAndEvaluate(file)
		.catch(err => {
			error(err)
			console.error(err)
		})
}


if (process.send) {
	process.on('message', main)
}
else if (require.main === module) {
	main(process.argv[2])
}
