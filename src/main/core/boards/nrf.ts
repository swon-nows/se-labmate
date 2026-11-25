import { anchors, dateOf, finishPosts, htmlText, stripBlocks, type Post } from './post'

const attr = (tag: string, name: string): string =>
  new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1] ?? ''

// 주소에 그대로 넣는 값은 숫자만 받는다.
const isDigits = (s: string): boolean => /^\d+$/.test(s)

export function parseNrf(html: string): Post[] {
  const doc = stripBlocks(html) // 주석 안에 가짜 링크가 있다
  if (!doc.includes('public-notice-list'))
    throw new Error('한국연구재단 페이지에서 목록을 찾지 못했습니다')
  const posts: Post[] = []
  for (const block of doc.split('class="public-notice-block"').slice(1)) {
    const a = anchors(block).find((x) => /\btitle-name\b/.test(x.attrs))
    if (!a) continue
    const state = block.slice(0, a.start)
    if (htmlText(state).includes('접수마감')) continue
    const postNo = attr(a.attrs, 'data-post_no')
    if (!isDigits(postNo)) continue
    const bizNo = attr(a.attrs, 'data-biz_no')
    const m = /접수일자\s*:\s*(\d{4})-(\d{2})-(\d{2})(?:[^~]{0,20}~\s*(\d{4}-\d{2}-\d{2}))?/.exec(
      htmlText(block)
    )
    posts.push({
      key: postNo,
      title: htmlText(a.inner),
      url: `https://www.nrf.re.kr/biz/notice/view?menu_no=362&post_no=${postNo}${isDigits(bizNo) ? `&biz_no=${bizNo}` : ''}`,
      date: m ? dateOf(m[1], m[2], m[3]) : null,
      summary: m ? `접수 ${m[1]}-${m[2]}-${m[3]}${m[4] ? ` ~ ${m[4]}` : ''}` : ''
    })
  }
  return finishPosts(posts)
}
