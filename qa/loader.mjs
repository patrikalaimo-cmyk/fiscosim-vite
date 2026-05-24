import path from 'node:path'
import { pathToFileURL } from 'node:url'

const CANDIDATE_SUFFIXES = ['.js', '.jsx', '.mjs', path.sep + 'index.js', path.sep + 'index.jsx']

export async function resolve(specifier, context, defaultResolve) {
  try {
    return await defaultResolve(specifier, context, defaultResolve)
  } catch (error) {
    const parentUrl = context?.parentURL || ''
    const isRelative = specifier.startsWith('./') || specifier.startsWith('../')
    const isFileUrl = parentUrl.startsWith('file:')
    if (!isRelative || !isFileUrl || error?.code !== 'ERR_MODULE_NOT_FOUND') {
      throw error
    }

    const parentPath = new URL(parentUrl)
    const basePath = path.resolve(path.dirname(parentPath.pathname), specifier)
    for (const suffix of CANDIDATE_SUFFIXES) {
      try {
        const candidateUrl = pathToFileURL(basePath + suffix).href
        return await defaultResolve(candidateUrl, context, defaultResolve)
      } catch {
        // try next candidate
      }
    }
    throw error
  }
}
