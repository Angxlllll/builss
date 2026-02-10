import { Boom } from '@hapi/boom'
import { getBinaryNodeChild } from '../WABinary'
import { delay, promiseTimeout } from '../Utils'
import { queueMicrotask } from 'node:timers'

export const makeMessagesRecvSocket = config => {
  const {
    logger,
    ev,
    authState,
    processingMutex,
    signalRepository,
    decryptMessage,
    upsertMessage,
    cleanMessage
  } = config

  const decrypt = async node => {
    const encNode = getBinaryNodeChild(node, 'enc')
    if (!encNode) return null

    try {
      return await decryptMessage(encNode, authState, signalRepository)
    } catch (err) {
      throw new Boom('Decryption failed', { cause: err })
    }
  }

  const handleMessage = async node => {
    const msg = await decrypt(node)
    if (!msg) return

    await processingMutex.mutex(async () => {
      cleanMessage(msg)
    })

    queueMicrotask(() => {
      try {
        upsertMessage(msg, 'notify')
      } catch {}
    })
  }

  const handleNode = async node => {
    if (!node) return
    if (!node.content) return
    await handleMessage(node)
  }

  ev.on('messages.upsert', async ({ messages }) => {
    if (!messages?.length) return
    for (const msg of messages) {
      handleNode(msg)
    }
  })
}