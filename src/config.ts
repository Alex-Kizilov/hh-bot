enum Experience {
    jun = "between1And3",
    mid = "between3And6",
    sen = "moreThan6"
}

export const CONFIG = {
    letterCover: 'Какой-то текст',
    jobTitle: 'Frontend',
    filters: {
        experience: Experience.jun,
    },
}
