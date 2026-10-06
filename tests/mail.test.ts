// Sender and message shape for SMTP. Pure functions only: no SMTP connection is opened.

import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSmtpMessage, resolveSender, type OutgoingMessage, type SmtpSettings } from '../lib/mail/smtp'

const base: SmtpSettings = {
    host: 'smtp.example.com', port: 587, secure: false, requireTLS: true,
    user: 'sender@example.com', pass: 'secret', from: 'Sam Rivera <other@elsewhere.test>',
}

const message: OutgoingMessage = {
    to: 'recruiter@example.org', subject: 'Backend Engineer', text: 'Hello,\n\nThank you for your time.',
    messageId: '<abc@example.com>', inReplyTo: null, references: null,
}

test('the From address is the authenticated SMTP account, and SMTP_FROM supplies only the name', () => {
    const sender = resolveSender(base)
    assert.equal(sender.address, 'sender@example.com')
    assert.equal(sender.name, 'Sam Rivera')
})

test('a From address in SMTP_FROM that differs from the login is ignored', () => {
    const built = buildSmtpMessage(base, message) as { from: { address: string } }
    assert.equal(built.from.address, 'sender@example.com')
    assert.notEqual(built.from.address, 'other@elsewhere.test')
})

test('when SMTP_USER is not an address, the address in SMTP_FROM is used', () => {
    const sender = resolveSender({ user: 'apikey', from: 'Sam <sam@example.com>' })
    assert.equal(sender.address, 'sam@example.com')
    assert.equal(sender.name, 'Sam')
})

test('a bare address in SMTP_FROM gives no display name', () => {
    assert.deepEqual(resolveSender({ user: 'sender@example.com', from: 'sender@example.com' }), { name: null, address: 'sender@example.com' })
})

test('a quoted display name is read without its quotes', () => {
    assert.equal(resolveSender({ user: 'sender@example.com', from: '"Sam Rivera" <sender@example.com>' }).name, 'Sam Rivera')
})

test('with no address anywhere, sending is refused with a clear message', () => {
    assert.throws(() => resolveSender({ user: 'apikey', from: 'Sam Rivera' }), /SMTP_USER or SMTP_FROM must contain an email address/)
})

test('the message is plain text only: it has a text body and no html body', () => {
    const built = buildSmtpMessage(base, message) as Record<string, unknown>
    assert.equal(built.text, message.text)
    assert.equal('html' in built, false)
    assert.equal(built.to, 'recruiter@example.org')
    assert.equal(built.messageId, '<abc@example.com>')
})

test('reply headers are passed through only when present', () => {
    const reply = buildSmtpMessage(base, { ...message, inReplyTo: '<orig@example.com>', references: '<orig@example.com>' }) as Record<string, unknown>
    assert.equal(reply.inReplyTo, '<orig@example.com>')
    assert.equal(reply.references, '<orig@example.com>')
    const plain = buildSmtpMessage(base, message) as Record<string, unknown>
    assert.equal(plain.inReplyTo, undefined)
})
