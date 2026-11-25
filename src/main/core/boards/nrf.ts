import { dateOf, finishPosts, htmlText, type Post } from './post'

const attr = (tag: string, name: string): string =>
  new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1] ?? ''

export function parseNrf(html: string): Post[] {
  const doc = html.replace(/<!--[\s\S]*?-->/g, '') // 주석 안에 가짜 링크가 있다
  if (!doc.includes('public-notice-list'))
    throw new Error('한국연구재단 페이지에서 목록을 찾지 못했습니다')
  const posts: Post[] = []
  for (const block of doc.split('class="public-notice-block"').slice(1)) {
    const a = /<a\b([^>]*\btitle-name\b[^>]*)>([\s\S]*?)<\/a>/.exec(block)
    if (!a) continue
    const state = block.slice(0, a.index)
    if (htmlText(state).includes('접수마감')) continue
    const postNo = attr(a[1], 'data-post_no')
    const bizNo = attr(a[1], 'data-biz_no')
    const m = /접수일자\s*:\s*(\d{4})-(\d{2})-(\d{2})(?:[^~]{0,20}~\s*(\d{4}-\d{2}-\d{2}))?/.exec(
      htmlText(block)
    )
    posts.push({
      key: postNo,
      title: htmlText(a[2]),
      url: `https://www.nrf.re.kr/biz/notice/view?menu_no=362&post_no=${postNo}&biz_no=${bizNo}`,
      date: m ? dateOf(m[1], m[2], m[3]) : null,
      summary: m ? `접수 ${m[1]}-${m[2]}-${m[3]}${m[4] ? ` ~ ${m[4]}` : ''}` : ''
    })
  }
  return finishPosts(posts)
}
