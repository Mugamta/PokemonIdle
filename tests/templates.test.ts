// .vue 템플릿 정적 검사: 화면에 아무것도 안 그려지는 실수를 빌드 단계 밖에서 잡는다
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, test } from 'vitest'
import { parse } from 'vue/compiler-sfc'
import { ElementTypes, NodeTypes, type ElementNode, type TemplateChildNode } from '@vue/compiler-core'

const SRC = join(__dirname, '../src')

function vueFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return vueFiles(p)
    return e.name.endsWith('.vue') ? [p] : []
  })
}

function walk(nodes: TemplateChildNode[], visit: (el: ElementNode) => void) {
  for (const n of nodes) {
    if (n.type === NodeTypes.ELEMENT) {
      visit(n)
      walk(n.children, visit)
    } else if (n.type === NodeTypes.IF) {
      for (const b of n.branches) walk(b.children, visit)
    } else if (n.type === NodeTypes.FOR) {
      walk(n.children, visit)
    }
  }
}

const files = vueFiles(SRC)

describe('vue 템플릿', () => {
  test('검사할 .vue 파일이 있다', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  // v-if / v-else / v-for / v-slot 없는 <template> 는 Vue 가 진짜 HTML <template> 로 내보내서
  // 안의 내용이 화면에 안 보인다 (조건만 지우고 래퍼를 남기면 생기는 버그)
  test.each(files.map((f) => [relative(SRC, f).replace(/\\/g, '/'), f]))('%s: 지시자 없는 <template> 래퍼가 없다', (_, file) => {
    const { descriptor, errors } = parse(readFileSync(file, 'utf-8'), { filename: file })
    expect(errors).toEqual([])
    const ast = descriptor.template?.ast
    if (!ast) return
    const bare: string[] = []
    walk(ast.children, (el) => {
      if (el.tag === 'template' && el.tagType !== ElementTypes.TEMPLATE && el.tagType !== ElementTypes.SLOT) {
        bare.push(`${el.loc.start.line}행: ${el.loc.source.split('\n')[0]}`)
      }
    })
    expect(bare, '조건 없는 <template> 는 지우거나 v-if 등을 붙이세요').toEqual([])
  })
})
